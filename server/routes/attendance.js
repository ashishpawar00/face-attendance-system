const express = require('express');
const router = express.Router();
const Student = require('../models/Student');
const Attendance = require('../models/Attendance');

// ───────────────────────────────────────────
// POST /api/attendance — Mark attendance
// ───────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { student_id, confidence } = req.body;
    if (!student_id) return res.status(400).json({ error: 'Student ID is required' });

    const student = await Student.findById(student_id).select('name roll_number department');
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const now = new Date();
    const date = now.toISOString().split('T')[0];
    const time = now.toTimeString().split(' ')[0];

    // Check if already marked today
    const existing = await Attendance.findOne({ student: student_id, date });
    if (existing) {
      return res.status(200).json({
        already_marked: true,
        student_name: student.name,
        time: existing.time,
        message: `${student.name} already marked Present today`
      });
    }

    const record = await Attendance.create({
      student: student_id,
      date,
      time,
      status: 'Present',
      confidence: confidence || null
    });

    res.status(201).json({
      _id: record._id,
      student_name: student.name,
      roll_number: student.roll_number,
      department: student.department,
      date,
      time,
      message: `✅ Attendance marked for ${student.name}`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ───────────────────────────────────────────
// GET /api/attendance/stats — Dashboard stats (before /:id or routes with params)
// ───────────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const totalStudents = await Student.countDocuments();
    const todayPresent = await Attendance.countDocuments({ date: today });
    const totalRecords = await Attendance.countDocuments();

    // Last 7 days trend
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    const fromDate = sevenDaysAgo.toISOString().split('T')[0];

    const trend = await Attendance.aggregate([
      { $match: { date: { $gte: fromDate } } },
      { $group: { _id: '$date', present: { $sum: 1 } } },
      { $sort: { _id: 1 } },
      { $project: { date: '$_id', present: 1, _id: 0 } }
    ]);

    res.json({
      total_students: totalStudents,
      today_present: todayPresent,
      today_absent: totalStudents - todayPresent,
      percentage: totalStudents > 0 ? Math.round((todayPresent / totalStudents) * 100) : 0,
      total_records: totalRecords,
      trend
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ───────────────────────────────────────────
// GET /api/attendance/report — Date range report
// ───────────────────────────────────────────
router.get('/report', async (req, res) => {
  try {
    const { from, to } = req.query;
    const fromDate = from || new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
    const toDate = to || new Date().toISOString().split('T')[0];

    const records = await Attendance.find({ date: { $gte: fromDate, $lte: toDate } })
      .populate('student', 'name roll_number department photo_url')
      .sort({ date: -1, time: -1 });

    const flat = records.map(r => ({
      _id: r._id,
      date: r.date,
      time: r.time,
      status: r.status,
      confidence: r.confidence,
      name: r.student?.name,
      roll_number: r.student?.roll_number,
      department: r.student?.department,
      photo_url: r.student?.photo_url
    }));

    res.json({ from: fromDate, to: toDate, records: flat });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ───────────────────────────────────────────
// GET /api/attendance — Attendance for a date
// ───────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const targetDate = req.query.date || new Date().toISOString().split('T')[0];

    const records = await Attendance.find({ date: targetDate })
      .populate('student', 'name roll_number department photo_url')
      .sort({ time: -1 });

    const totalStudents = await Student.countDocuments();

    const flat = records.map(r => ({
      _id: r._id,
      date: r.date,
      time: r.time,
      status: r.status,
      confidence: r.confidence,
      name: r.student?.name,
      roll_number: r.student?.roll_number,
      department: r.student?.department,
      photo_url: r.student?.photo_url
    }));

    res.json({
      date: targetDate,
      total_students: totalStudents,
      present: flat.length,
      absent: totalStudents - flat.length,
      percentage: totalStudents > 0 ? Math.round((flat.length / totalStudents) * 100) : 0,
      records: flat
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ───────────────────────────────────────────
// DELETE /api/attendance/:id — Remove a record
// ───────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const record = await Attendance.findByIdAndDelete(req.params.id);
    if (!record) return res.status(404).json({ error: 'Record not found' });
    res.json({ message: 'Attendance record deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
