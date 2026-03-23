// ═══════════════════════════════════════════
//  attendance.js — Camera Fix + Phase 5 Liveness
// ═══════════════════════════════════════════

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

// State
let video, overlay;
let isScanning = false;
let scanInterval = null;
let storedDescriptors = [];
let markedStudents = new Set();
let recognizedCount = 0;
let modelsLoaded = false;
let currentStream = null;
let useFrontCamera = true;

// Phase 5 — Liveness
let prevLandmarks = null;
let livenessFrameCount = 0;
let livenessMovementDetected = false;

const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model';

// Init
document.addEventListener('DOMContentLoaded', async () => {
  video = document.getElementById('video');
  overlay = document.getElementById('overlay');

  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const faceInfo = document.getElementById('faceInfo');
  const flipCameraBtn = document.getElementById('flipCameraBtn');

  // Load models
  try {
    faceInfo.textContent = '⏳ Loading AI models...';
    faceInfo.style.color = 'var(--warning)';

    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]);
    modelsLoaded = true;
    faceInfo.textContent = '✅ AI ready! Starting camera...';
    faceInfo.style.color = 'var(--success)';
  } catch (err) {
    faceInfo.textContent = '❌ AI models failed. Check internet.';
    faceInfo.style.color = 'var(--danger)';
    document.getElementById('scanStatus').textContent = 'Error';
    document.getElementById('scanStatus').className = 'badge badge-danger';
    document.getElementById('webcamLoading').style.display = 'none';
    return;
  }

  await initCamera();
  await loadDescriptors();
  await updateSummary();

  startBtn.addEventListener('click', () => {
    if (storedDescriptors.length === 0) { showToast('No students registered!', 'warning'); return; }
    startScanning();
  });
  stopBtn.addEventListener('click', stopScanning);

  if (flipCameraBtn) {
    flipCameraBtn.addEventListener('click', async () => {
      const was = isScanning; if (was) stopScanning();
      useFrontCamera = !useFrontCamera;
      await initCamera();
      if (was) startScanning();
    });
  }
});

// ═══════════════════════════════════════════
//  CAMERA — Permission-first approach
// ═══════════════════════════════════════════
async function initCamera() {
  const faceInfo = document.getElementById('faceInfo');
  const webcamLoading = document.getElementById('webcamLoading');
  const startBtn = document.getElementById('startBtn');
  const scanStatus = document.getElementById('scanStatus');
  const camSelect = document.getElementById('cameraSelect');

  stopStream();

  try {
    // Step 1: Permission
    faceInfo.textContent = '📷 Requesting camera...';
    let tempStream = await navigator.mediaDevices.getUserMedia({ video: true });
    tempStream.getTracks().forEach(t => t.stop());

    // Step 2: Enumerate
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cameras = devices.filter(d => d.kind === 'videoinput');
    if (cameras.length === 0) throw new Error('No cameras found');

    // Step 3: Populate dropdown
    if (camSelect) {
      camSelect.innerHTML = cameras.map((c, i) =>
        `<option value="${c.deviceId}">${c.label || 'Camera '+(i+1)}</option>`
      ).join('');

      const realCam = cameras.find(c =>
        c.label && !/droidcam|virtual|obs|snap|manycam|splitcam|xsplit/i.test(c.label)
      );
      if (realCam) camSelect.value = realCam.deviceId;

      if (!camSelect._attached) {
        camSelect._attached = true;
        camSelect.addEventListener('change', async () => {
          const was = isScanning; if (was) stopScanning();
          await startStreamWithDevice(camSelect.value);
          if (was) startScanning();
        });
      }
    }

    // Step 4: Start
    const selectedId = camSelect ? camSelect.value : cameras[0].deviceId;
    await startStreamWithDevice(selectedId);

    webcamLoading.style.display = 'none';
    startBtn.disabled = false;

    const count = storedDescriptors.length;
    faceInfo.textContent = `✅ Camera ready! ${count} student(s) loaded.`;
    faceInfo.style.color = 'var(--success)';
    scanStatus.textContent = 'Ready'; scanStatus.className = 'badge badge-success';

  } catch (err) {
    console.error('Camera error:', err);
    let msg = 'Camera unavailable.';
    if (err.name === 'NotAllowedError') msg = 'Camera permission denied.';
    else if (err.name === 'NotFoundError') msg = 'No camera found.';
    else if (err.name === 'NotReadableError') msg = 'Camera in use by another app.';
    faceInfo.textContent = '❌ ' + msg; faceInfo.style.color = 'var(--danger)';
    scanStatus.textContent = 'No Camera'; scanStatus.className = 'badge badge-danger';
    showToast(msg, 'error');
  }
}

async function startStreamWithDevice(deviceId) {
  stopStream();
  try {
    currentStream = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: deviceId }, width: { ideal: 640 }, height: { ideal: 480 } }
    });
  } catch (e) {
    try { currentStream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { ideal: deviceId } } }); }
    catch (e2) { currentStream = await navigator.mediaDevices.getUserMedia({ video: true }); }
  }

  video.srcObject = currentStream;
  await new Promise((resolve, reject) => {
    video.onloadedmetadata = () => video.play().then(resolve).catch(reject);
    video.onerror = reject;
    setTimeout(() => reject(new Error('Timeout')), 8000);
  });

  const track = currentStream.getVideoTracks()[0];
  console.log('🎥 Camera active:', track.label);
}

function stopStream() {
  if (currentStream) { currentStream.getTracks().forEach(t => t.stop()); currentStream = null; }
}

// ═════ Load Descriptors ═════
async function loadDescriptors() {
  try {
    const res = await apiFetch('/api/students/descriptors/all');
    const students = await res.json();
    storedDescriptors = students.map(s => ({
      id: s._id, name: s.name, rollNumber: s.roll_number,
      department: s.department, descriptor: new Float32Array(s.face_descriptor)
    }));
    const faceInfo = document.getElementById('faceInfo');
    if (storedDescriptors.length === 0) {
      faceInfo.textContent = '⚠️ No students registered. Register first!';
      faceInfo.style.color = 'var(--warning)';
    }
  } catch (e) { console.error('Descriptors error:', e); }
}

// ═════ Scanning ═════
function startScanning() {
  isScanning = true;
  prevLandmarks = null; livenessFrameCount = 0; livenessMovementDetected = false;

  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const scanStatus = document.getElementById('scanStatus');
  const faceInfo = document.getElementById('faceInfo');
  const container = document.getElementById('webcamContainer');
  const guide = document.getElementById('faceGuide');

  startBtn.style.display = 'none'; stopBtn.style.display = 'inline-flex';
  scanStatus.textContent = 'Scanning...'; scanStatus.className = 'badge badge-warning';
  faceInfo.textContent = '🔍 Scanning for faces...'; faceInfo.style.color = 'var(--warning)';
  container.classList.add('scanning');
  if (guide) guide.style.display = 'none';
  showToast('Scanning started!', 'info');

  detectAndMatch();
  scanInterval = setInterval(detectAndMatch, 1500);
}

function stopScanning() {
  isScanning = false;
  if (scanInterval) { clearInterval(scanInterval); scanInterval = null; }
  prevLandmarks = null; livenessFrameCount = 0;

  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const scanStatus = document.getElementById('scanStatus');
  const faceInfo = document.getElementById('faceInfo');
  const container = document.getElementById('webcamContainer');
  const guide = document.getElementById('faceGuide');

  startBtn.style.display = 'inline-flex'; stopBtn.style.display = 'none';
  scanStatus.textContent = 'Stopped'; scanStatus.className = 'badge badge-danger';
  faceInfo.textContent = '⏹ Stopped.'; faceInfo.style.color = 'var(--text-secondary)';
  container.classList.remove('scanning');
  if (guide) guide.style.display = '';
  if (overlay) { overlay.getContext('2d').clearRect(0, 0, overlay.width, overlay.height); }
}

// ═══════════════════════════════════════════
//  DETECT + MATCH + LIVENESS (Phase 5)
// ═══════════════════════════════════════════
async function detectAndMatch() {
  if (!isScanning || !modelsLoaded || !video || video.paused || video.videoWidth === 0) return;
  try {
    const size = { width: video.videoWidth, height: video.videoHeight };
    faceapi.matchDimensions(overlay, size);

    const dets = await faceapi
      .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.5 }))
      .withFaceLandmarks().withFaceDescriptors();

    const resized = faceapi.resizeResults(dets, size);
    const ctx = overlay.getContext('2d');
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    document.getElementById('faceInfo').textContent = `🔍 ${dets.length} face(s) detected`;

    for (const det of resized) {
      // ── Phase 5: Liveness Check ──
      const landmarks = det.landmarks;
      let isLive = checkLiveness(landmarks);

      const match = findBestMatch(det.descriptor);
      const box = det.detection.box;

      if (match && isLive) {
        // Green box — recognized + live
        ctx.strokeStyle = '#10b981'; ctx.lineWidth = 3;
        ctx.strokeRect(box.x, box.y, box.width, box.height);
        ctx.fillStyle = 'rgba(16,185,129,0.85)';
        ctx.fillRect(box.x, box.y - 30, Math.max(box.width, 140), 30);
        ctx.fillStyle = '#fff'; ctx.font = 'bold 13px Inter,sans-serif';
        ctx.fillText(`${match.name} (${(match.confidence*100).toFixed(0)}%)`, box.x+6, box.y-10);
        if (!markedStudents.has(match.id)) await markAttendance(match);
      } else if (match && !isLive) {
        // Orange box — recognized but liveness not confirmed yet
        ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 3;
        ctx.strokeRect(box.x, box.y, box.width, box.height);
        ctx.fillStyle = 'rgba(245,158,11,0.85)';
        ctx.fillRect(box.x, box.y - 30, Math.max(box.width, 160), 30);
        ctx.fillStyle = '#fff'; ctx.font = 'bold 12px Inter,sans-serif';
        ctx.fillText(`${match.name} - move slightly`, box.x+6, box.y-10);
      } else {
        // Red box — unknown
        ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 3;
        ctx.strokeRect(box.x, box.y, box.width, box.height);
        ctx.fillStyle = 'rgba(239,68,68,0.85)';
        ctx.fillRect(box.x, box.y - 30, box.width, 30);
        ctx.fillStyle = '#fff'; ctx.font = 'bold 13px Inter,sans-serif';
        ctx.fillText('Unknown', box.x+6, box.y-10);
      }
    }
  } catch (e) { console.error('Detection error:', e); }
}

// ═══════════════════════════════════════════
//  PHASE 5 — Liveness Detection
//  Checks if face landmarks move between frames
//  (rejects static photos that don't move at all)
// ═══════════════════════════════════════════
function checkLiveness(landmarks) {
  const positions = landmarks.positions;
  const noseTip = positions[30]; // nose tip landmark

  if (!prevLandmarks) {
    prevLandmarks = { x: noseTip.x, y: noseTip.y };
    livenessFrameCount = 1;
    return false; // need at least 2 frames
  }

  // Calculate movement from previous frame
  const dx = Math.abs(noseTip.x - prevLandmarks.x);
  const dy = Math.abs(noseTip.y - prevLandmarks.y);
  const movement = Math.sqrt(dx*dx + dy*dy);

  prevLandmarks = { x: noseTip.x, y: noseTip.y };
  livenessFrameCount++;

  // If movement > 2px between frames, face is live (not a photo)
  if (movement > 2) {
    livenessMovementDetected = true;
  }

  // After 3+ frames with movement detected → consider live
  return livenessFrameCount >= 3 && livenessMovementDetected;
}

function findBestMatch(query) {
  let best = null, bestDist = Infinity;
  for (const s of storedDescriptors) {
    const d = faceapi.euclideanDistance(query, s.descriptor);
    if (d < bestDist) { bestDist = d; best = s; }
  }
  return best && bestDist < 0.5 ? { ...best, confidence: 1 - bestDist } : null;
}

// ═════ Mark Attendance ═════
async function markAttendance(match) {
  try {
    const res = await apiFetch('/api/attendance', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_id: match.id, confidence: match.confidence })
    });
    const data = await res.json();
    markedStudents.add(match.id);
    if (!data.already_marked) {
      recognizedCount++;
      document.getElementById('recognizedCount').textContent = `${recognizedCount} Marked`;
      addRecognitionCard(match, data);
      showToast(`✅ ${match.name} — Marked!`, 'success');
      updateSummary();
    } else showToast(`${match.name} — Already marked`, 'info');
  } catch (e) { console.error('Mark error:', e); }
}

function addRecognitionCard(match, data) {
  const container = document.getElementById('recognitionResults');
  const empty = container.querySelector('.empty-state'); if (empty) empty.remove();
  const card = document.createElement('div');
  card.className = 'recognition-card matched';
  card.innerHTML = `
    <div style="width:44px;height:44px;border-radius:50%;background:var(--gradient-success);display:flex;align-items:center;justify-content:center;font-size:1.2rem;color:white;flex-shrink:0;">
      ${match.name.charAt(0).toUpperCase()}
    </div>
    <div class="info" style="flex:1;">
      <h4>${match.name}</h4>
      <p>${match.rollNumber} • ${match.department}</p>
      <p style="color:var(--success);font-size:0.72rem;">
        ${(match.confidence*100).toFixed(1)}% • ${data.time || 'Now'}
      </p>
    </div>
    <span class="badge badge-success">✅</span>`;
  container.prepend(card);
}

async function updateSummary() {
  try {
    const res = await apiFetch('/api/attendance/stats');
    const stats = await res.json();
    const p = document.getElementById('summaryPresent');
    const a = document.getElementById('summaryAbsent');
    if (p) p.textContent = stats.today_present;
    if (a) a.textContent = stats.today_absent;
  } catch (e) {}
}
