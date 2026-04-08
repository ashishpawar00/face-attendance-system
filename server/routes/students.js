const express = require('express');
const router = express.Router();
const multer = require('multer');
const Student = require('../models/Student');
const Attendance = require('../models/Attendance');
const { uploadToCloudinary, deleteFromCloudinary } = require('../cloudinary');

// Use memoryStorage — files go directly to Cloudinary, not disk
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'), false);
  }
});

// ───────────────────────────────────────────
// GET /api/students — All students
// ───────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const students = await Student.find().sort({ name: 1 }).select('-face_descriptor');
    res.json(students);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ───────────────────────────────────────────
// GET /api/students/descriptors/all — For face matching (must be before /:id)
// ───────────────────────────────────────────
router.get('/descriptors/all', async (req, res) => {
  try {
    const students = await Student.find({ face_descriptor: { $ne: null, $exists: true } })
      .select('name roll_number department face_descriptor');
    res.json(students);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ───────────────────────────────────────────
// GET /api/students/:id
// ───────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const student = await Student.findById(req.params.id).select('-face_descriptor');
    if (!student) return res.status(404).json({ error: 'Student not found' });
    res.json(student);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ───────────────────────────────────────────
// POST /api/students — Register a student
// ───────────────────────────────────────────
router.post('/', upload.single('photo'), async (req, res) => {
  try {
    let { name, roll_number, department, face_descriptor } = req.body;
    if (!name || !roll_number || !department) {
      return res.status(400).json({ error: 'Name, roll number, and department are required' });
    }

    // Check duplicate roll number
    const existing = await Student.findOne({ roll_number: roll_number.toUpperCase() });
    if (existing) {
      return res.status(409).json({ error: `Roll number ${roll_number} is already registered` });
    }

    let photo_url = null;
    let photo_public_id = null;

    // Upload photo to Cloudinary (optional — if it fails, registration still works)
    if (req.file) {
      try {
        const result = await uploadToCloudinary(req.file.buffer);
        photo_url = result.url;
        photo_public_id = result.public_id;
      } catch (uploadErr) {
        console.warn('Photo upload skipped:', uploadErr.message);
        // Registration continues without photo — face descriptor is what matters
      }
    }

    const student = await Student.create({
      name: name.trim(),
      roll_number: roll_number.trim().toUpperCase(),
      department: department.trim(),
      photo_url,
      photo_public_id,
      face_descriptor: face_descriptor ? JSON.parse(face_descriptor) : null
    });

    res.status(201).json({
      _id: student._id,
      name: student.name,
      roll_number: student.roll_number,
      department: student.department,
      photo_url: student.photo_url,
      message: `${student.name} registered successfully`
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ───────────────────────────────────────────
// PUT /api/students/:id — Update student
// ───────────────────────────────────────────
router.put('/:id', upload.single('photo'), async (req, res) => {
  try {
    const student = await Student.findById(req.params.id);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const { name, roll_number, department, face_descriptor } = req.body;

    if (req.file) {
      // Delete old photo from Cloudinary
      await deleteFromCloudinary(student.photo_public_id);
      const result = await uploadToCloudinary(req.file.buffer);
      student.photo_url = result.url;
      student.photo_public_id = result.public_id;
    }

    if (name) student.name = name.trim();
    if (roll_number) student.roll_number = roll_number.trim().toUpperCase();
    if (department) student.department = department.trim();
    if (face_descriptor) student.face_descriptor = JSON.parse(face_descriptor);

    await student.save();
    res.json({ message: 'Student updated successfully', student });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ───────────────────────────────────────────
// DELETE /api/students/:id
// ───────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const student = await Student.findById(req.params.id);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    // Delete from Cloudinary
    await deleteFromCloudinary(student.photo_public_id);

    // Delete all attendance records
    await Attendance.deleteMany({ student: student._id });

    await student.deleteOne();
    res.json({ message: `${student.name} deleted successfully` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
