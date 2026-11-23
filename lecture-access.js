(function (root) {
  function canWatch(lecture, overrides) {
    if (!lecture) return false;
    const id = lecture.id;
    if (typeof id === "string" && Object.prototype.hasOwnProperty.call(overrides || {}, id)) {
      const setting = overrides[id];
      if (typeof setting === "boolean") return setting;
    }
    return lecture.releaseMode === "unlocked";
  }
  if (typeof module === "object") module.exports = canWatch;
  else root.tahCanWatchLecture = canWatch;
})(globalThis);
