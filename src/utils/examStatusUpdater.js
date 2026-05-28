const Exam = require("../models/Exam");

/**
 * Calculates the correct status of an exam based on time.
 * @param {Object} exam - The exam document.
 * @param {Date} now - The current date/time.
 * @returns {string} - The correct status ("scheduled", "active", or "completed").
 */
const calculateExamStatus = (exam, now = new Date()) => {
  const startTime = new Date(exam.startTime);
  
  if (exam.schedulingType === "range") {
    const endTime = exam.endTime ? new Date(exam.endTime) : null;
    if (now < startTime) {
      return "scheduled";
    } else if (!endTime || now <= endTime) {
      return "active";
    } else {
      return "completed";
    }
  } else {
    // fixed scheduling type
    const gracePeriodMs = 30 * 60 * 1000; // 30 minutes grace/join window
    const graceEndTime = new Date(startTime.getTime() + gracePeriodMs);
    
    if (now < startTime) {
      return "scheduled";
    } else if (now <= graceEndTime) {
      return "active";
    } else {
      return "completed";
    }
  }
};

/**
 * Updates the status of a single exam in the database if it has changed.
 * @param {Object} exam - The exam document/object.
 * @param {Date} now - The current date/time.
 * @returns {Promise<Object>} - The updated or unmodified exam.
 */
const updateSingleExamStatus = async (exam, now = new Date()) => {
  // If exam is in "draft", we leave it as "draft".
  if (exam.status === "draft") {
    return exam;
  }

  const correctStatus = calculateExamStatus(exam, now);
  if (exam.status !== correctStatus) {
    const updated = await Exam.findByIdAndUpdate(
      exam._id,
      { $set: { status: correctStatus } },
      { new: true }
    ).lean();
    return updated || exam;
  }
  return exam;
};

/**
 * Updates all non-draft exams in the database based on the current time.
 * @param {Date} now - The current date/time.
 */
const updateAllExamsStatus = async (now = new Date()) => {
  try {
    const exams = await Exam.find({ status: { $ne: "draft" } });
    let updatedCount = 0;
    
    for (const exam of exams) {
      const correctStatus = calculateExamStatus(exam, now);
      if (exam.status !== correctStatus) {
        await Exam.updateOne(
          { _id: exam._id },
          { $set: { status: correctStatus } }
        );
        updatedCount++;
      }
    }
    
    if (updatedCount > 0) {
      console.log(`[examStatusUpdater] Updated status for ${updatedCount} exams.`);
    }
  } catch (error) {
    console.error("[examStatusUpdater] Error in updateAllExamsStatus:", error);
  }
};

module.exports = {
  calculateExamStatus,
  updateSingleExamStatus,
  updateAllExamsStatus,
};
