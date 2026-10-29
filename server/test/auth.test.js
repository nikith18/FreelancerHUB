const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-only-secret-with-at-least-32-bytes-long";
process.env.CLIENT_ORIGIN = "http://freelancerhub-test.local";

const { createApp } = require("../app");
const { JWT_AUDIENCE, JWT_ISSUER, createSessionToken } = require("../utils/session");
const { createRateLimit } = require("../middleware/rate-limits");
const User = require("../models/User");
const Job = require("../models/Job");
const Application = require("../models/Application");
const Project = require("../models/Project");
const Notification = require("../models/Notification");
const SkillVerification = require("../models/SkillVerification");

const app = createApp();
let server;
let baseUrl;

test.before(async () => {
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (!server) return;
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

function fakeUser(role = "freelancer", sessionVersion = 0) {
  return {
    _id: new mongoose.Types.ObjectId(),
    name: "Test Person",
    email: "person@example.test",
    role,
    status: "active",
    sessionVersion,
    verificationStatus: "unverified",
    profile: { headline: "Test profile", skills: [] },
    createdAt: new Date("2026-01-01T00:00:00Z"),
  };
}

function replaceMethod(t, target, name, replacement) {
  const original = target[name];
  target[name] = replacement;
  t.after(() => { target[name] = original; });
}

function setConnectedForTest(t) {
  const original = mongoose.connection.readyState;
  mongoose.connection.readyState = 1;
  t.after(() => { mongoose.connection.readyState = original; });
}

function send(path, { method = "GET", user, token, body, headers = {} } = {}) {
  const requestHeaders = { ...headers };
  if (user && !requestHeaders.Authorization) requestHeaders.Authorization = `Bearer ${createSessionToken(user)}`;
  if (token) requestHeaders.Authorization = `Bearer ${token}`;
  if (body !== undefined) requestHeaders["Content-Type"] = "application/json";
  return fetch(`${baseUrl}${path}`, { method, headers: requestHeaders, body: body === undefined ? undefined : JSON.stringify(body) });
}

function csrfHeaders() {
  return { Origin: "http://freelancerhub-test.local", "X-CSRF-Protection": "1" };
}

test("anonymous protected request is rejected", async () => {
  const response = await send("/api/admin/stats");
  assert.equal(response.status, 401);
});

test("job route rejects malformed identifiers and oversized pagination before querying MongoDB", async () => {
  assert.equal((await send("/api/jobs/not-an-object-id")).status, 400);
  assert.equal((await send("/api/jobs?limit=1000")).status, 400);
});

test("tab bearer session returns only safe current-user fields", async (t) => {
  const user = fakeUser("freelancer");
  replaceMethod(t, User, "findById", async () => user);
  const response = await send("/api/auth/me", { user });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.data.role, "freelancer");
  assert.equal("passwordHash" in body.data, false);
  assert.equal("token" in body.data, false);
});

test("authentication uses only this request's bearer token and never falls back to a shared cookie", async (t) => {
  const client = fakeUser("client");
  const freelancer = fakeUser("freelancer");
  replaceMethod(t, User, "findById", async (id) => id === client._id.toString() ? client : freelancer);
  const response = await send("/api/auth/me", {
    token: createSessionToken(client),
    headers: { Cookie: `freelancerhub_session=${createSessionToken(freelancer)}` },
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).data.role, "client");
  const cookieOnly = await send("/api/auth/me", { headers: { Cookie: `freelancerhub_session=${createSessionToken(freelancer)}` } });
  assert.equal(cookieOnly.status, 401);
  const invalidBearer = await send("/api/auth/me", { token: "invalid", headers: { Cookie: `freelancerhub_session=${createSessionToken(freelancer)}` } });
  assert.equal(invalidBearer.status, 401);
});

test("three independent tab tokens keep client, freelancer, and admin identities separate", async (t) => {
  const users = [fakeUser("client"), fakeUser("freelancer"), fakeUser("admin")];
  const byId = new Map(users.map((user) => [user._id.toString(), user]));
  replaceMethod(t, User, "findById", async (id) => byId.get(id));

  for (const user of users) {
    const token = createSessionToken(user);
    for (let refresh = 0; refresh < 2; refresh += 1) {
      const response = await send("/api/auth/me", { token });
      assert.equal(response.status, 200);
      assert.equal((await response.json()).data.role, user.role);
    }
  }
});

test("expired access token is rejected", async () => {
  const userId = new mongoose.Types.ObjectId().toString();
  const token = jwt.sign({ sub: userId, ver: 0 }, process.env.JWT_SECRET, {
    algorithm: "HS256", issuer: JWT_ISSUER, audience: JWT_AUDIENCE, expiresIn: -1,
  });
  const response = await send("/api/auth/me", { token });
  assert.equal(response.status, 401);
});

test("version-mismatched session is rejected after logout revocation", async (t) => {
  const user = fakeUser("client", 1);
  replaceMethod(t, User, "findById", async () => user);
  const oldUser = { ...user, sessionVersion: 0 };
  const response = await send("/api/auth/me", { user: oldUser });
  assert.equal(response.status, 401);
});

test("legacy bearer token is rejected instead of falling back to a shared cookie", async (t) => {
  const user = fakeUser("client");
  replaceMethod(t, User, "findById", async () => user);
  const token = jwt.sign({ sub: user._id.toString() }, process.env.JWT_SECRET, { algorithm: "HS256", expiresIn: "7d" });
  const response = await send("/api/auth/me", { token });
  assert.equal(response.status, 401);
  assert.equal(response.headers.get("set-cookie"), null);
});

test("unsafe requests without trusted origin and CSRF header are rejected", async () => {
  const response = await send("/api/auth/logout", { method: "POST" });
  assert.equal(response.status, 403);
});

test("public registration cannot create an admin or mass-assign privileged fields", async (t) => {
  let createCalls = 0;
  replaceMethod(t, User, "create", async () => { createCalls += 1; throw new Error("Should not create an admin."); });
  const response = await send("/api/auth/register", {
    method: "POST",
    headers: csrfHeaders(),
    body: { name: "Public User", email: "public@example.test", password: "long-test-password", role: "admin", status: "active", isAdmin: true },
  });
  assert.equal(response.status, 400);
  assert.equal(createCalls, 0);
});

test("registration hashes the password, normalizes email and discards privileged fields", async (t) => {
  const user = fakeUser("client");
  let created;
  replaceMethod(t, User, "create", async (document) => { created = document; return user; });
  const response = await send("/api/auth/register", {
    method: "POST",
    headers: csrfHeaders(),
    body: { name: "  Public User ", email: "Public@Example.test ", password: "long-test-password", role: "client", status: "suspended", isAdmin: true },
  });
  const body = await response.json();
  assert.equal(response.status, 201);
  assert.equal(created.email, "public@example.test");
  assert.equal(created.name, "Public User");
  assert.deepEqual(Object.keys(created).sort(), ["email", "name", "passwordHash", "role"]);
  assert.notEqual(created.passwordHash, "long-test-password");
  assert.equal(await bcrypt.compare("long-test-password", created.passwordHash), true);
  assert.equal(typeof body.data.token, "string");
  assert.equal(response.headers.get("set-cookie"), null);
});

test("duplicate registration uses the generic registration response", async (t) => {
  replaceMethod(t, User, "create", async () => { throw Object.assign(new Error("duplicate"), { code: 11000 }); });
  const response = await send("/api/auth/register", {
    method: "POST",
    headers: csrfHeaders(),
    body: { name: "Public User", email: "taken@example.test", password: "long-test-password", role: "client" },
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).message, "Unable to register with those details.");
});

test("invalid registration data is rejected without creating an account", async (t) => {
  let createCalls = 0;
  replaceMethod(t, User, "create", async () => { createCalls += 1; });
  const response = await send("/api/auth/register", {
    method: "POST", headers: csrfHeaders(),
    body: { name: "X", email: "bad-email", password: "short", role: "client" },
  });
  assert.equal(response.status, 400);
  assert.equal(createCalls, 0);
});

test("valid login returns a short-lived tab token and does not set a shared cookie", async (t) => {
  const user = fakeUser("freelancer");
  user.passwordHash = await bcrypt.hash("long-test-password", 4);
  replaceMethod(t, User, "findOne", () => ({ select: async () => user }));
  const response = await send("/api/auth/login", {
    method: "POST",
    headers: csrfHeaders(),
    body: { email: "PERSON@example.test", password: "long-test-password" },
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.data.user.role, "freelancer");
  assert.equal(typeof body.data.token, "string");
  assert.equal(jwt.decode(body.data.token).exp - jwt.decode(body.data.token).iat, 3600);
  assert.equal(response.headers.get("set-cookie"), null);
});

test("incorrect login password gets a generic authentication response", async (t) => {
  const user = fakeUser("client");
  user.passwordHash = await bcrypt.hash("correct-test-password", 4);
  replaceMethod(t, User, "findOne", () => ({ select: async () => user }));
  const response = await send("/api/auth/login", {
    method: "POST", headers: csrfHeaders(),
    body: { email: user.email, password: "incorrect-test-password" },
  });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).message, "Email or password is incorrect.");
});

test("clients and freelancers cannot use admin or cross-role project endpoints", async (t) => {
  const user = fakeUser("freelancer");
  const admin = fakeUser("admin");
  replaceMethod(t, User, "findById", async (id) => id === admin._id.toString() ? admin : user);
  const adminResponse = await send("/api/admin/stats", { user });
  const adminProjectResponse = await send("/api/projects/my", { user: admin });
  assert.equal(adminResponse.status, 403);
  assert.equal(adminProjectResponse.status, 403);
});

test("client job updates scope the database update to the authenticated owner", async (t) => {
  setConnectedForTest(t);
  const user = fakeUser("client");
  let observedFilter;
  replaceMethod(t, User, "findById", async () => user);
  replaceMethod(t, Application, "exists", async () => null);
  replaceMethod(t, Job, "findOneAndUpdate", async (filter) => { observedFilter = filter; return null; });
  const response = await send(`/api/jobs/${new mongoose.Types.ObjectId()}`, {
    method: "PUT", user, headers: csrfHeaders(), body: { title: "A valid job title" },
  });
  assert.equal(response.status, 404);
  assert.equal(observedFilter.client.toString(), user._id.toString());
});

test("a client cannot read another client's proposals", async (t) => {
  setConnectedForTest(t);
  const user = fakeUser("client");
  const otherClientJob = { _id: new mongoose.Types.ObjectId(), client: new mongoose.Types.ObjectId() };
  replaceMethod(t, User, "findById", async () => user);
  replaceMethod(t, Job, "findById", () => ({ select: async () => otherClientJob }));
  const response = await send(`/api/applications/job/${otherClientJob._id}`, { user });
  assert.equal(response.status, 404);
});

test("private project lists query only the authenticated client's resources", async (t) => {
  setConnectedForTest(t);
  const user = fakeUser("client");
  let observedFilter;
  replaceMethod(t, User, "findById", async () => user);
  replaceMethod(t, Project, "find", (filter) => {
    observedFilter = filter;
    return { sort() { return this; }, limit() { return this; }, populate() { return this; }, lean: async () => [] };
  });
  const response = await send("/api/projects/my", { user });
  assert.equal(response.status, 200);
  assert.equal(observedFilter.client.toString(), user._id.toString());
});

test("notification updates include the recipient in the database filter", async (t) => {
  setConnectedForTest(t);
  const user = fakeUser("freelancer");
  let observedFilter;
  replaceMethod(t, User, "findById", async () => user);
  replaceMethod(t, Notification, "findOneAndUpdate", async (filter) => { observedFilter = filter; return null; });
  const response = await send(`/api/notifications/${new mongoose.Types.ObjectId()}/read`, {
    method: "PATCH", user, headers: csrfHeaders(),
  });
  assert.equal(response.status, 404);
  assert.equal(observedFilter.recipient.toString(), user._id.toString());
});

test("logout increments the user's session version without setting a shared cookie", async (t) => {
  setConnectedForTest(t);
  const user = fakeUser("client");
  let update;
  replaceMethod(t, User, "findById", async () => user);
  replaceMethod(t, User, "findByIdAndUpdate", async (_id, changes) => { update = changes; return user; });
  const response = await send("/api/auth/logout", { method: "POST", user, headers: csrfHeaders() });
  assert.equal(response.status, 200);
  assert.equal(update.$inc.sessionVersion, 1);
  assert.equal(response.headers.get("set-cookie"), null);
});

test("rate limit middleware returns 429 after its configured request allowance", async (t) => {
  const limitedApp = express();
  limitedApp.use(createRateLimit({ windowMs: 60000, limit: 1, message: "Test limit." }));
  limitedApp.get("/", (req, res) => res.json({ success: true }));
  const limitedServer = http.createServer(limitedApp);
  await new Promise((resolve) => limitedServer.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    limitedServer.closeAllConnections();
    await new Promise((resolve) => limitedServer.close(resolve));
  });
  const url = `http://127.0.0.1:${limitedServer.address().port}/`;
  assert.equal((await fetch(url)).status, 200);
  assert.equal((await fetch(url)).status, 429);
});

test("SkillProof endpoints require freelancer/admin roles and reject anonymous users", async (t) => {
  const anonymous = await send("/api/skillproof/mine");
  assert.equal(anonymous.status, 401);
  const client = fakeUser("client");
  replaceMethod(t, User, "findById", async () => client);
  const clientResponse = await send("/api/skillproof/mine", { user: client });
  assert.equal(clientResponse.status, 403);
  const adminResponse = await send("/api/skillproof/admin", { user: client });
  assert.equal(adminResponse.status, 403);
});

test("freelancer claim creates only a normalized own claim and ignores privileged input", async (t) => {
  setConnectedForTest(t);
  const user = fakeUser("freelancer");
  let created;
  replaceMethod(t, User, "findById", async () => user);
  replaceMethod(t, SkillVerification, "create", async (document) => { created = document; return { ...document, _id: new mongoose.Types.ObjectId(), status: "claimed" }; });
  const response = await send("/api/skillproof/mine", {
    method: "POST", user, headers: csrfHeaders(),
    body: { skillName: "  React   Development ", user: new mongoose.Types.ObjectId(), status: "verified", reviewer: new mongoose.Types.ObjectId(), reviewHistory: [{ decision: "approved" }] },
  });
  assert.equal(response.status, 201);
  assert.equal(created.user.toString(), user._id.toString());
  assert.equal(created.skillName, "React   Development");
  assert.equal(created.skillKey, "react development");
  assert.equal(created.status, undefined);
  assert.equal(created.reviewer, undefined);
});

test("SkillProof evidence rejects dangerous URL schemes", async (t) => {
  setConnectedForTest(t);
  const user = fakeUser("freelancer");
  replaceMethod(t, User, "findById", async () => user);
  const response = await send(`/api/skillproof/${new mongoose.Types.ObjectId()}/evidence`, {
    method: "POST", user, headers: csrfHeaders(),
    body: { type: "github", url: "javascript:alert(1)", description: "A sufficiently long explanation of this evidence." },
  });
  assert.equal(response.status, 400);
});

test("freelancer can submit valid evidence only to their own claimed record", async (t) => {
  setConnectedForTest(t);
  const user = fakeUser("freelancer");
  const recordId = new mongoose.Types.ObjectId();
  let filter;
  let update;
  replaceMethod(t, User, "findById", async () => user);
  replaceMethod(t, SkillVerification, "findOne", async () => ({ _id: recordId, status: "claimed" }));
  replaceMethod(t, SkillVerification, "findOneAndUpdate", async (query, changes) => { filter = query; update = changes; return { _id: recordId, ...changes.$set }; });
  const response = await send(`/api/skillproof/${recordId}/evidence`, {
    method: "POST", user, headers: csrfHeaders(),
    body: { type: "github", url: "https://github.com/example/project", description: "This repository demonstrates the skill in a working implementation." },
  });
  assert.equal(response.status, 201);
  assert.equal(filter.user.toString(), user._id.toString());
  assert.equal(filter.status, "claimed");
  assert.equal(update.$set.status, "evidence_submitted");
  assert.equal(update.$push.evidenceHistory.type, "github");
});

test("a rejected claim can be resubmitted without replacing earlier evidence", async (t) => {
  setConnectedForTest(t);
  const user = fakeUser("freelancer");
  const recordId = new mongoose.Types.ObjectId();
  let update;
  replaceMethod(t, User, "findById", async () => user);
  replaceMethod(t, SkillVerification, "findOne", async () => ({ _id: recordId, status: "rejected" }));
  replaceMethod(t, SkillVerification, "findOneAndUpdate", async (_filter, changes) => { update = changes; return { _id: recordId, status: "evidence_submitted" }; });
  const response = await send(`/api/skillproof/${recordId}/evidence`, {
    method: "POST", user, headers: csrfHeaders(),
    body: { type: "written_explanation", description: "This revised explanation adds the missing implementation details requested." },
  });
  assert.equal(response.status, 201);
  assert.equal(update.$set.status, "evidence_submitted");
  assert.equal(update.$push.evidenceHistory.description, "This revised explanation adds the missing implementation details requested.");
});

test("a freelancer can withdraw only their own pending evidence and the withdrawal is recorded", async (t) => {
  setConnectedForTest(t);
  const user = fakeUser("freelancer");
  const recordId = new mongoose.Types.ObjectId();
  const submittedAt = new Date();
  let filter;
  let update;
  replaceMethod(t, User, "findById", async () => user);
  replaceMethod(t, SkillVerification, "findOne", () => ({ select() { return this; }, lean: async () => ({ status: "evidence_submitted", submittedAt, evidenceHistory: [{ _id: new mongoose.Types.ObjectId() }] }) }));
  replaceMethod(t, SkillVerification, "findOneAndUpdate", async (query, changes) => { filter = query; update = changes; return { _id: recordId, status: "claimed" }; });
  const response = await send(`/api/skillproof/${recordId}/withdraw`, { method: "POST", user, headers: csrfHeaders() });
  assert.equal(response.status, 200);
  assert.equal(filter.user.toString(), user._id.toString());
  assert.equal(filter.status, "evidence_submitted");
  assert.equal(filter.submittedAt.getTime(), submittedAt.getTime());
  assert.equal(update.$set.status, "claimed");
  assert.equal("withdrawalHistory" in update.$push, true);
  assert.equal("reviewHistory" in update.$push, false);
});

test("freelancer cannot read another user's private SkillProof record", async (t) => {
  setConnectedForTest(t);
  const user = fakeUser("freelancer");
  const otherUser = new mongoose.Types.ObjectId();
  replaceMethod(t, User, "findById", async () => user);
  replaceMethod(t, SkillVerification, "findById", () => ({ populate() { return this; }, lean: async () => ({ _id: new mongoose.Types.ObjectId(), user: otherUser, status: "rejected", reviewFeedback: "private note" }) }));
  const response = await send(`/api/skillproof/${new mongoose.Types.ObjectId()}`, { user });
  assert.equal(response.status, 404);
});

test("only an admin can approve evidence and approval is an atomic pending-state transition", async (t) => {
  setConnectedForTest(t);
  const client = fakeUser("client");
  replaceMethod(t, User, "findById", async () => client);
  const clientResponse = await send(`/api/skillproof/admin/${new mongoose.Types.ObjectId()}/review`, {
    method: "PATCH", user: client, headers: csrfHeaders(), body: { decision: "approve", reason: "Evidence reviewed and accepted." },
  });
  assert.equal(clientResponse.status, 403);

  const admin = fakeUser("admin");
  const recordId = new mongoose.Types.ObjectId();
  let filter;
  let update;
  replaceMethod(t, User, "findById", async () => admin);
  replaceMethod(t, SkillVerification, "findById", () => ({ select() { return this; }, lean: async () => ({ submittedAt: new Date(), evidenceHistory: [{ _id: new mongoose.Types.ObjectId() }] }) }));
  replaceMethod(t, SkillVerification, "findOneAndUpdate", async (query, changes) => { filter = query; update = changes; return { _id: recordId }; });
  const response = await send(`/api/skillproof/admin/${recordId}/review`, {
    method: "PATCH", user: admin, headers: csrfHeaders(), body: { decision: "approve", reason: "Repository and project evidence reviewed." },
  });
  assert.equal(response.status, 200);
  assert.equal(filter.status, "evidence_submitted");
  assert.equal(filter.submittedAt instanceof Date, true);
  assert.equal(update.$set.status, "verified");
  assert.equal(update.$set.reviewer.toString(), admin._id.toString());
  assert.equal(update.$push.reviewHistory.decision, "approved");

  const infoResponse = await send(`/api/skillproof/admin/${new mongoose.Types.ObjectId()}/review`, {
    method: "PATCH", user: admin, headers: csrfHeaders(), body: { decision: "more_info", reason: "Please include a clearer example of your contribution." },
  });
  assert.equal(infoResponse.status, 200);
  assert.equal(update.$set.status, "reviewed");
  assert.equal(update.$set.reviewDecision, "more_info");
  assert.equal(update.$push.reviewHistory.decision, "more_info");
});

test("public verified skills use a safe projection and omit evidence links and review notes", async (t) => {
  setConnectedForTest(t);
  const userId = new mongoose.Types.ObjectId();
  let selected;
  replaceMethod(t, User, "findOne", () => ({ select() { return this; }, lean: async () => ({ _id: userId }) }));
  replaceMethod(t, SkillVerification, "find", (filter) => {
    assert.equal(filter.status, "verified");
    return { select(fields) { selected = fields; return this; }, sort() { return this; }, lean: async () => [{ skillName: "React", evidenceType: "github", reviewedAt: new Date(), evidenceUrl: "https://private.example", reviewFeedback: "private" }] };
  });
  const response = await send(`/api/skillproof/public/${userId}`);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(selected.includes("evidenceUrl"), false);
  assert.equal("reviewFeedback" in body.data[0], false);
  assert.equal("evidenceUrl" in body.data[0], false);
  assert.equal(body.data[0].skillName, "React");
});

test("client proposal view includes only public-safe verified skill badges", async (t) => {
  setConnectedForTest(t);
  const client = fakeUser("client");
  const freelancerId = new mongoose.Types.ObjectId();
  const jobId = new mongoose.Types.ObjectId();
  let projection;
  replaceMethod(t, User, "findById", async () => client);
  replaceMethod(t, Job, "findById", () => ({ select: async () => ({ _id: jobId, client: client._id }) }));
  replaceMethod(t, Application, "find", () => ({ sort() { return this; }, populate() { return this; }, lean: async () => [{ freelancer: { _id: freelancerId, name: "Freelancer", profile: { skills: ["React"] } } }] }));
  replaceMethod(t, SkillVerification, "find", (filter) => {
    assert.equal(filter.status, "verified");
    return { select(fields) { projection = fields; return this; }, lean: async () => [{ user: freelancerId, skillName: "React", evidenceType: "github", reviewedAt: new Date(), evidenceUrl: "https://private.example", reviewFeedback: "private" }] };
  });
  const response = await send(`/api/applications/job/${jobId}`, { user: client });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(projection.includes("evidenceUrl"), false);
  assert.deepEqual(body.data[0].freelancer.verifiedSkills[0], { skillName: "React", evidenceType: "github", verifiedAt: body.data[0].freelancer.verifiedSkills[0].verifiedAt });
  assert.equal("reviewFeedback" in body.data[0].freelancer.verifiedSkills[0], false);
});
