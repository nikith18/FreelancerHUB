const mongoose = require("mongoose");

const jobSchema = new mongoose.Schema(
  {
    client: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    title: {
      type: String,
      required: [true, "A job title is required."],
      trim: true,
      minlength: 5,
      maxlength: 120,
    },
    description: {
      type: String,
      required: [true, "A job description is required."],
      trim: true,
      minlength: 20,
      maxlength: 5000,
    },
    requiredSkills: {
      type: [String],
      default: [],
      validate: {
        validator: (skills) => skills.length <= 20 && skills.every((skill) => skill.trim().length > 0 && skill.length <= 40),
        message: "Provide up to 20 non-empty skills, each no longer than 40 characters.",
      },
    },
    budget: {
      type: Number,
      required: [true, "A budget is required."],
      min: [1, "Budget must be at least 1."],
      max: [100000000, "Budget is too large."],
    },
    currency: {
      type: String,
      uppercase: true,
      trim: true,
      default: "USD",
      match: [/^[A-Z]{3}$/, "Currency must be a 3-letter code."],
    },
    jobType: {
      type: String,
      enum: ["fixed", "hourly"],
      default: "fixed",
    },
    status: {
      type: String,
      enum: ["open", "closed", "removed"],
      default: "open",
    },
    category: {
      type: String,
      trim: true,
      maxlength: 60,
      default: "",
    },
    deadline: {
      type: Date,
      default: null,
      validate: {
        validator: (value) => value == null || !Number.isNaN(value.getTime()),
        message: "Deadline must be a valid date.",
      },
    },
  },
  { timestamps: true },
);

jobSchema.index({ status: 1, createdAt: -1 });
jobSchema.index({ requiredSkills: 1 });
jobSchema.index({ client: 1, status: 1 });

module.exports = mongoose.model("Job", jobSchema);
