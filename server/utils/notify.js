const Notification = require("../models/Notification");

module.exports = function notify(recipient, type, message, relatedResource = null) {
  return Notification.create({ recipient, type, message, relatedResource }).catch(() => null);
};
