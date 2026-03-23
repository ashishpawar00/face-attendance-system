// ═══════════════════════════════════════════
//  dashboard.js — Phase 1
// ═══════════════════════════════════════════

function showToast(msg, type = 'info') {
  const c = document.getElementById('toastContainer'); if (!c) return;
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
  t.innerHTML = `<span>${icons[type]||''}</span><span>${msg}</span>`;
  c.appendChild(t);
  setTimeout(() => { t.style.animation = 'slideOut 0.4s ease forwards'; setTimeout(() => t.remove(), 400); }, 3500);
}

async function loadDashboard() {
  try {
    const [statsRes, todayRes, studentsRes] = await Promise.all([
      fetch('/api/attendance/stats'),
      fetch('/api/attendance'),
      fetch('/api/students')
    ]);

    const stats = await statsRes.json();
    const todayData = await todayRes.json();
    const students = await studentsRes.json();

    // Animate stat counters
    animateCounter('totalStudents', stats.total_students);
    animateCounter('todayPresent', stats.today_present);
    animateCounter('todayAbsent', stats.today_absent);
    document.getElementById('percentage').textContent = stats.percentage + '%';

    // Today's log
    const todayLog = document.getElementById('todayLog');
    const todayBadge = document.getElementById('todayBadge');
    todayBadge.textContent = `${todayData.present} Present`;

    if (todayData.records && todayData.records.length > 0) {
      todayLog.innerHTML = todayData.records.slice(0, 8).map(r => `
        <div class="recognition-card matched" style="animation-delay:${Math.random()*0.3}s;">
          <div style="width:40px;height:40px;border-radius:50%;background:var(--gradient-primary);display:flex;align-items:center;justify-content:center;font-size:1rem;flex-shrink:0;color:white;">
            ${(r.name || '?').charAt(0)}
          </div>
          <div class="info" style="flex:1;">
            <h4>${r.name || 'Unknown'}</h4>
            <p>${r.roll_number || ''} • ${r.time || ''}</p>
          </div>
          <span class="badge badge-success">Present</span>
        </div>`).join('');
    }

    // Students preview
    const preview = document.getElementById('studentsPreview');
    if (students.length > 0) {
      preview.innerHTML = `<div class="students-grid">${students.slice(0, 6).map(s => `
        <div class="student-card" style="padding:1rem;">
          <div class="student-photo placeholder" style="width:48px;height:48px;font-size:1.1rem;margin-bottom:0.5rem;">
            ${s.name.charAt(0)}
          </div>
          <h3 style="font-size:0.85rem;">${s.name}</h3>
          <p class="roll">${s.roll_number}</p>
          <p class="dept">${s.department}</p>
        </div>`).join('')}</div>`;
    }
  } catch (err) {
    console.error('Dashboard error:', err);
    showToast('Failed to load dashboard', 'error');
  }
}

function animateCounter(id, target) {
  const el = document.getElementById(id); if (!el) return;
  const start = 0; const duration = 800;
  const startTime = performance.now();
  function step(now) {
    const progress = Math.min((now - startTime) / duration, 1);
    el.textContent = Math.floor(progress * target);
    if (progress < 1) requestAnimationFrame(step);
    else el.textContent = target;
  }
  requestAnimationFrame(step);
}

document.addEventListener('DOMContentLoaded', loadDashboard);
