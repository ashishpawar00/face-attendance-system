// ═══════════════════════════════════════════
//  register.js — Camera Fix + Phase 2 Multi-Sample
// ═══════════════════════════════════════════

// authFetch is provided by auth-helper.js loaded before this script
// Falls back to plain fetch if auth-helper not loaded yet
function apiFetch(url, options = {}) {
  return typeof authFetch === 'function' ? authFetch(url, options) : fetch(url, options);
}

function showToast(msg, type = 'info') {
  const c = document.getElementById('toastContainer'); if (!c) return;
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
  t.innerHTML = `<span>${icons[type]||''}</span><span>${msg}</span>`;
  c.appendChild(t);
  setTimeout(() => { t.style.animation = 'slideOut 0.4s ease forwards'; setTimeout(() => t.remove(), 400); }, 3500);
}

// ===== State =====
let video, overlay, captureCanvas;
let currentFaceDescriptor = null;
let capturedBlob = null;
let modelsLoaded = false;
let detectionInterval = null;
let currentStream = null;
let useFrontCamera = true;

// Phase 2 — Multi-sample
const REQUIRED_SAMPLES = 5;
let collectedDescriptors = [];
let capturePhase = 'idle'; // idle | capturing | done

const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model';

// ===== Init =====
document.addEventListener('DOMContentLoaded', async () => {
  video = document.getElementById('video');
  overlay = document.getElementById('overlay');
  captureCanvas = document.getElementById('captureCanvas');

  const faceStatus = document.getElementById('faceStatus');
  const captureBtn = document.getElementById('captureBtn');
  const retakeBtn = document.getElementById('retakeBtn');
  const photoUpload = document.getElementById('photoUpload');
  const registerForm = document.getElementById('registerForm');
  const flipCameraBtn = document.getElementById('flipCameraBtn');

  // Load models
  try {
    faceStatus.textContent = '⏳ Loading AI models...';
    faceStatus.style.color = 'var(--warning)';

    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]);
    modelsLoaded = true;
    faceStatus.textContent = '✅ AI ready! Starting camera...';
    faceStatus.style.color = 'var(--success)';
  } catch (err) {
    faceStatus.textContent = '❌ AI models failed. Check internet.';
    faceStatus.style.color = 'var(--danger)';
    document.getElementById('webcamLoading').style.display = 'none';
    return;
  }

  // Start camera with permission-first approach
  await initCamera();
  loadStudents();

  captureBtn.addEventListener('click', startMultiCapture);
  retakeBtn.addEventListener('click', retakePhoto);
  if (photoUpload) photoUpload.addEventListener('change', handleFileUpload);
  registerForm.addEventListener('submit', handleRegistration);

  if (flipCameraBtn) {
    flipCameraBtn.addEventListener('click', async () => {
      useFrontCamera = !useFrontCamera;
      if (detectionInterval) clearInterval(detectionInterval);
      await initCamera();
    });
  }

  setupFormValidation();
});

// ═════ Form Validation =════
function setupFormValidation() {
  ['name', 'rollNumber', 'department'].forEach(id => {
    const el = document.getElementById(id); if (!el) return;
    el.addEventListener('blur', () => {
      if (!el.value.trim()) el.classList.add('is-invalid');
      else { el.classList.remove('is-invalid'); el.classList.add('is-valid'); }
    });
    el.addEventListener('input', () => {
      el.classList.remove('is-invalid');
      if (el.value.trim()) el.classList.add('is-valid');
    });
  });
}

// ═══════════════════════════════════════════
//  CAMERA — Permission-first approach
//  1. getUserMedia({video:true}) to get permission
//  2. Enumerate devices
//  3. Find best real webcam (skip DroidCam etc)
//  4. Restart stream with that specific device
// ═══════════════════════════════════════════
async function initCamera() {
  const faceStatus = document.getElementById('faceStatus');
  const webcamLoading = document.getElementById('webcamLoading');
  const captureBtn = document.getElementById('captureBtn');
  const camSelect = document.getElementById('cameraSelect');

  // Stop existing stream
  stopStream();

  try {
    // Step 1: Get permission with any camera first
    faceStatus.textContent = '📷 Requesting camera access...';
    faceStatus.style.color = 'var(--warning)';

    let tempStream;
    try {
      tempStream = await navigator.mediaDevices.getUserMedia({ video: true });
    } catch (e) {
      // If basic fails, we have no camera
      throw e;
    }
    // Stop temp stream immediately — just needed for permission
    tempStream.getTracks().forEach(t => t.stop());

    // Step 2: Enumerate all camera devices (now we have permission, labels are available)
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cameras = devices.filter(d => d.kind === 'videoinput');

    if (cameras.length === 0) throw new Error('No cameras found');

    // Step 3: Populate dropdown
    if (camSelect) {
      camSelect.innerHTML = cameras.map((c, i) =>
        `<option value="${c.deviceId}">${c.label || 'Camera ' + (i+1)}</option>`
      ).join('');

      // Auto-select: prefer real webcam over virtual
      const realCam = cameras.find(c =>
        c.label && !/droidcam|virtual|obs|snap|manycam|splitcam|xsplit/i.test(c.label)
      );
      if (realCam) {
        camSelect.value = realCam.deviceId;
      }

      // Attach change listener once
      if (!camSelect._attached) {
        camSelect._attached = true;
        camSelect.addEventListener('change', async () => {
          if (detectionInterval) clearInterval(detectionInterval);
          await startStreamWithDevice(camSelect.value);
        });
      }
    }

    // Step 4: Start stream with selected device
    const selectedId = camSelect ? camSelect.value : cameras[0].deviceId;
    await startStreamWithDevice(selectedId);

    webcamLoading.style.display = 'none';
    if (captureBtn) captureBtn.disabled = false;

  } catch (err) {
    console.error('Camera init error:', err);
    let msg = 'Camera error.';
    if (err.name === 'NotAllowedError') msg = 'Camera permission denied. Allow camera in browser settings.';
    else if (err.name === 'NotFoundError') msg = 'No camera found. Plug in a webcam.';
    else if (err.name === 'NotReadableError') msg = 'Camera in use by another app. Close other apps using camera.';
    faceStatus.textContent = '❌ ' + msg;
    faceStatus.style.color = 'var(--danger)';
    webcamLoading.innerHTML = `<p style="color:var(--danger);padding:1rem;text-align:center;">📷 ${msg}</p>`;
    showToast(msg, 'error');
  }
}

async function startStreamWithDevice(deviceId) {
  const faceStatus = document.getElementById('faceStatus');

  stopStream();

  // Build constraints with the specific deviceId
  const constraints = { video: { deviceId: { exact: deviceId }, width: { ideal: 640 }, height: { ideal: 480 } } };

  try {
    currentStream = await navigator.mediaDevices.getUserMedia(constraints);
  } catch (e) {
    // Fallback: try without exact
    try {
      currentStream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { ideal: deviceId } } });
    } catch (e2) {
      currentStream = await navigator.mediaDevices.getUserMedia({ video: true });
    }
  }

  video.srcObject = currentStream;
  await new Promise((resolve, reject) => {
    video.onloadedmetadata = () => video.play().then(resolve).catch(reject);
    video.onerror = reject;
    setTimeout(() => reject(new Error('Video playback timeout')), 8000);
  });

  // Log which camera we connected to
  const track = currentStream.getVideoTracks()[0];
  console.log('🎥 Camera active:', track.label);
  faceStatus.textContent = `✅ ${track.label || 'Camera'} ready!`;
  faceStatus.style.color = 'var(--success)';

  // Start face detection preview
  startFaceDetectionPreview();
}

function stopStream() {
  if (currentStream) {
    currentStream.getTracks().forEach(t => t.stop());
    currentStream = null;
  }
  if (detectionInterval) { clearInterval(detectionInterval); detectionInterval = null; }
}

// ═════ Face Detection Preview =════
function startFaceDetectionPreview() {
  if (detectionInterval) clearInterval(detectionInterval);

  detectionInterval = setInterval(async () => {
    if (!modelsLoaded || !video || video.paused || video.videoWidth === 0) return;
    if (capturePhase === 'capturing' || capturePhase === 'done') return;

    try {
      const size = { width: video.videoWidth, height: video.videoHeight };
      faceapi.matchDimensions(overlay, size);

      const det = await faceapi
        .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
        .withFaceLandmarks();

      const ctx = overlay.getContext('2d');
      ctx.clearRect(0, 0, overlay.width, overlay.height);

      const guide = document.getElementById('faceGuide');
      const status = document.getElementById('faceStatus');

      if (det) {
        const resized = faceapi.resizeResults(det, size);
        faceapi.draw.drawDetections(overlay, [resized]);
        if (guide) guide.classList.add('detected');
        status.textContent = '✅ Face detected — click Capture!';
        status.style.color = 'var(--success)';
      } else {
        if (guide) guide.classList.remove('detected');
        status.textContent = '👤 Position face in the guide';
        status.style.color = 'var(--text-secondary)';
      }
    } catch (e) { /* frame error, skip */ }
  }, 600);
}

// ═══════════════════════════════════════════
//  PHASE 2 — Multi-Sample Capture (5 samples)
// ═══════════════════════════════════════════
async function startMultiCapture() {
  const faceStatus = document.getElementById('faceStatus');
  const captureBtn = document.getElementById('captureBtn');
  const retakeBtn = document.getElementById('retakeBtn');
  const guide = document.getElementById('faceGuide');

  if (!modelsLoaded) { showToast('AI not loaded yet', 'warning'); return; }

  capturePhase = 'capturing';
  collectedDescriptors = [];
  captureBtn.disabled = true;
  captureBtn.textContent = `📸 Capturing 0/${REQUIRED_SAMPLES}...`;

  // Clear overlay
  const ctx = overlay.getContext('2d');
  ctx.clearRect(0, 0, overlay.width, overlay.height);

  for (let i = 0; i < REQUIRED_SAMPLES; i++) {
    faceStatus.textContent = `📸 Sample ${i+1}/${REQUIRED_SAMPLES} — hold still...`;
    faceStatus.style.color = 'var(--warning)';
    captureBtn.textContent = `📸 ${i}/${REQUIRED_SAMPLES}...`;

    // Wait a moment between captures for slight angle variation
    if (i > 0) await sleep(800);

    try {
      const det = await faceapi
        .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.5 }))
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!det) {
        faceStatus.textContent = `❌ No face on sample ${i+1}! Keep face visible.`;
        faceStatus.style.color = 'var(--danger)';
        i--; // retry this sample
        await sleep(1000);
        continue;
      }

      // Check for blur: if face detection score < 0.6, consider blurry
      if (det.detection.score < 0.6) {
        faceStatus.textContent = `⚠️ Blurry! Hold steady. Retrying sample ${i+1}...`;
        faceStatus.style.color = 'var(--warning)';
        i--;
        await sleep(800);
        continue;
      }

      collectedDescriptors.push(Array.from(det.descriptor));

      // Draw green box to show capture succeeded
      const resized = faceapi.resizeResults(det, { width: video.videoWidth, height: video.videoHeight });
      ctx.clearRect(0, 0, overlay.width, overlay.height);
      ctx.strokeStyle = '#10b981'; ctx.lineWidth = 3;
      const box = resized.detection.box;
      ctx.strokeRect(box.x, box.y, box.width, box.height);

      faceStatus.textContent = `✅ Sample ${i+1}/${REQUIRED_SAMPLES} captured!`;
      faceStatus.style.color = 'var(--success)';

      showToast(`Sample ${i+1}/${REQUIRED_SAMPLES} captured`, 'success');
    } catch (err) {
      console.error(`Sample ${i+1} error:`, err);
      i--; // retry
      await sleep(500);
    }
  }

  // Average all descriptors
  const avgDescriptor = new Array(128).fill(0);
  for (const d of collectedDescriptors) {
    for (let j = 0; j < 128; j++) avgDescriptor[j] += d[j];
  }
  for (let j = 0; j < 128; j++) avgDescriptor[j] /= collectedDescriptors.length;
  currentFaceDescriptor = avgDescriptor;

  // Take final photo
  captureCanvas.width = video.videoWidth;
  captureCanvas.height = video.videoHeight;
  captureCanvas.getContext('2d').drawImage(video, 0, 0);
  capturedBlob = await new Promise(r => captureCanvas.toBlob(r, 'image/jpeg', 0.9));

  // Update UI
  const preview = document.getElementById('photoPreview');
  preview.src = URL.createObjectURL(capturedBlob);
  preview.classList.add('visible');
  retakeBtn.style.display = 'inline-flex';
  captureBtn.style.display = 'none';
  document.getElementById('submitBtn').disabled = false;
  if (guide) guide.style.display = 'none';
  capturePhase = 'done';

  faceStatus.textContent = `✅ ${REQUIRED_SAMPLES} samples captured! Fill details and register.`;
  faceStatus.style.color = 'var(--success)';
  showToast('All face samples captured!', 'success');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function retakePhoto() {
  currentFaceDescriptor = null; capturedBlob = null;
  collectedDescriptors = []; capturePhase = 'idle';
  document.getElementById('photoPreview').classList.remove('visible');
  document.getElementById('retakeBtn').style.display = 'none';
  const btn = document.getElementById('captureBtn');
  btn.style.display = 'inline-flex'; btn.disabled = false;
  btn.textContent = '📸 Capture Photo';
  document.getElementById('submitBtn').disabled = true;
  const guide = document.getElementById('faceGuide');
  if (guide) guide.style.display = '';
  startFaceDetectionPreview();
}

// ═════ File Upload =════
async function handleFileUpload(e) {
  const file = e.target.files[0]; if (!file) return;
  const faceStatus = document.getElementById('faceStatus');
  faceStatus.textContent = '🔍 Analyzing uploaded photo...';

  try {
    const img = await faceapi.fetchImage(URL.createObjectURL(file));
    const det = await faceapi
      .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.5 }))
      .withFaceLandmarks().withFaceDescriptor();

    if (!det) {
      faceStatus.textContent = '❌ No face in photo.'; faceStatus.style.color = 'var(--danger)';
      showToast('No face found in photo', 'error'); return;
    }

    currentFaceDescriptor = Array.from(det.descriptor);
    capturedBlob = file; capturePhase = 'done';
    const preview = document.getElementById('photoPreview');
    preview.src = URL.createObjectURL(file); preview.classList.add('visible');
    document.getElementById('captureBtn').style.display = 'none';
    document.getElementById('retakeBtn').style.display = 'inline-flex';
    document.getElementById('submitBtn').disabled = false;

    faceStatus.textContent = '✅ Face detected from upload!'; faceStatus.style.color = 'var(--success)';
    showToast('Face detected!', 'success');
  } catch (err) {
    faceStatus.textContent = '❌ Error analyzing photo.'; faceStatus.style.color = 'var(--danger)';
  }
}

// ═════ Registration =════
async function handleRegistration(e) {
  e.preventDefault();
  const submitBtn = document.getElementById('submitBtn');
  const name = document.getElementById('name').value.trim();
  const rollNumber = document.getElementById('rollNumber').value.trim();
  const department = document.getElementById('department').value;

  if (!name || !rollNumber || !department) { showToast('Fill all fields', 'warning'); return; }
  if (!currentFaceDescriptor) { showToast('Capture face first', 'warning'); return; }

  submitBtn.disabled = true; submitBtn.textContent = '⏳ Registering...';

  try {
    const fd = new FormData();
    fd.append('name', name);
    fd.append('roll_number', rollNumber);
    fd.append('department', department);
    fd.append('face_descriptor', JSON.stringify(currentFaceDescriptor));
    if (capturedBlob) fd.append('photo', capturedBlob, 'photo.jpg');

    const res = await apiFetch('/api/students', { method: 'POST', body: fd });
    const data = await res.json();
    if (res.ok) {
      showToast(`✅ ${name} registered!`, 'success');
      document.getElementById('registerForm').reset();
      document.querySelectorAll('.is-valid').forEach(el => el.classList.remove('is-valid'));
      retakePhoto();
      if (document.getElementById('photoUpload')) document.getElementById('photoUpload').value = '';
      loadStudents();
    } else showToast(data.error || 'Failed', 'error');
  } catch (err) { showToast('Registration failed', 'error'); }

  submitBtn.disabled = false; submitBtn.textContent = '✅ Register Student';
}

// ═════ Students List =════
async function loadStudents() {
  try {
    const res = await apiFetch('/api/students');
    const students = await res.json();
    const container = document.getElementById('studentsList');
    const badge = document.getElementById('studentCount');
    badge.textContent = `${students.length} Student${students.length !== 1 ? 's' : ''}`;

    if (students.length === 0) {
      container.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">
        <div class="empty-icon">📚</div><h3>No students yet</h3><p>Register your first student above</p></div>`;
      return;
    }
    container.innerHTML = students.map(s => `
      <div class="student-card">
        ${s.photo_url ? `<img src="${s.photo_url}" class="student-photo" alt="${s.name}" onerror="this.outerHTML='<div class=\\'student-photo placeholder\\'>${s.name.charAt(0)}</div>'">` : `<div class="student-photo placeholder">${s.name.charAt(0).toUpperCase()}</div>`}
        <h3>${s.name}</h3><p class="roll">${s.roll_number}</p><p class="dept">${s.department}</p>
        <div class="card-actions">
          <button class="btn btn-danger btn-sm" onclick="deleteStudent('${s._id}','${s.name}')">🗑️ Delete</button>
        </div>
      </div>`).join('');
  } catch (err) { console.error('Load error:', err); }
}

async function deleteStudent(id, name) {
  if (!confirm(`Delete ${name}?`)) return;
  try {
    const res = await apiFetch(`/api/students/${id}`, { method: 'DELETE' });
    if (res.ok) { showToast(`${name} deleted`, 'success'); loadStudents(); }
    else showToast('Delete failed', 'error');
  } catch (e) { showToast('Delete failed', 'error'); }
}
