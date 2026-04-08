// ═══════════════════════════════════════════
//  dashboard.js — Phase 4: Chart.js + Enhanced
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

let weeklyChart = null;

async function loadDashboard() {
  try {
    const [statsRes, todayRes, studentsRes] = await Promise.all([
      apiFetch('/api/attendance/stats'),
      apiFetch('/api/attendance'),
      apiFetch('/api/students')
    ]);

    const stats = await statsRes.json();
    const todayData = await todayRes.json();
    const students = await studentsRes.json();

    // Animate stat counters
    animateCounter('totalStudents', stats.total_students);
    animateCounter('todayPresent', stats.today_present);
    animateCounter('todayAbsent', stats.today_absent);
    document.getElementById('percentage').textContent = stats.percentage + '%';

    // ── Chart.js Weekly Trend ──
    renderWeeklyChart(stats.trend, stats.total_students);

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

// ═══════════════════════════════════════════
//  CHART.JS — Weekly Attendance Trend
// ═══════════════════════════════════════════
function renderWeeklyChart(trend, totalStudents) {
  const canvas = document.getElementById('weeklyChart');
  if (!canvas || typeof Chart === 'undefined') return;

  // Build last 7 days labels
  const labels = [];
  const presentData = [];
  const absentData = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
    labels.push(dayName);

    const match = trend.find(t => t.date === dateStr);
    const present = match ? match.present : 0;
    presentData.push(present);
    absentData.push(Math.max(totalStudents - present, 0));
  }

  // Destroy old chart if exists
  if (weeklyChart) weeklyChart.destroy();

  const ctx = canvas.getContext('2d');

  // Gradient fills
  const presentGrad = ctx.createLinearGradient(0, 0, 0, 280);
  presentGrad.addColorStop(0, 'rgba(16, 185, 129, 0.5)');
  presentGrad.addColorStop(1, 'rgba(16, 185, 129, 0.02)');

  const absentGrad = ctx.createLinearGradient(0, 0, 0, 280);
  absentGrad.addColorStop(0, 'rgba(239, 68, 68, 0.3)');
  absentGrad.addColorStop(1, 'rgba(239, 68, 68, 0.02)');

  weeklyChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Present',
          data: presentData,
          borderColor: '#10b981',
          backgroundColor: presentGrad,
          fill: true,
          tension: 0.4,
          borderWidth: 2.5,
          pointBackgroundColor: '#10b981',
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          pointRadius: 5,
          pointHoverRadius: 7,
        },
        {
          label: 'Absent',
          data: absentData,
          borderColor: '#ef4444',
          backgroundColor: absentGrad,
          fill: true,
          tension: 0.4,
          borderWidth: 2,
          pointBackgroundColor: '#ef4444',
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          borderDash: [5, 5],
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          labels: {
            color: '#94a3b8',
            font: { family: 'Inter, sans-serif', size: 12 },
            usePointStyle: true,
            pointStyle: 'circle',
            padding: 20
          }
        },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          titleColor: '#f1f5f9',
          bodyColor: '#cbd5e1',
          borderColor: 'rgba(99, 102, 241, 0.3)',
          borderWidth: 1,
          cornerRadius: 8,
          padding: 12,
          callbacks: {
            label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y} students`
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(148, 163, 184, 0.08)' },
          ticks: { color: '#64748b', font: { family: 'Inter, sans-serif', size: 11 } }
        },
        y: {
          grid: { color: 'rgba(148, 163, 184, 0.08)' },
          ticks: {
            color: '#64748b',
            font: { family: 'Inter, sans-serif', size: 11 },
            stepSize: 1,
            beginAtZero: true
          }
        }
      }
    }
  });
}

function animateCounter(id, target) {
  const el = document.getElementById(id); if (!el) return;
  const duration = 800;
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
