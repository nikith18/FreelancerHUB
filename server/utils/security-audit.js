function recordAdminAction(req, action, targetType, targetId) {
  console.info(JSON.stringify({
    event: "admin_action",
    actorId: req.user._id.toString(),
    action,
    targetType,
    targetId: targetId.toString(),
    at: new Date().toISOString(),
  }));
}

module.exports = { recordAdminAction };
