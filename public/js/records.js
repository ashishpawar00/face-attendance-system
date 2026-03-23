// ═══════════════════════════════════════════
//  records.js — Phase 1
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

let currentRecords = [];

document.addEventListener('DOMContentLoaded', () => {
  const filterDate = document.getElementById('filterDate');
  const filterDept = document.getElementById('filterDept');
  const exportCSV = document.getElementById('exportCSV');

  // Default to today
  filterDate.value = new Date().toISOString().split('T')[0];

  filterDate.addEventListener('change', loadRecords);
  filterDept.addEventListener('change', renderRecords);

  if (exportCSV) exportCSV.addEventListener('click', exportToCSV);

  loadRecords();
});

async function loadRecords() {
  const date = document.getElementById('filterDate').value || new Date().toISOString().split('T')[0];
  document.getElementById('selectedDate').textContent = date;

  try {
    const res = await apiFetch(`/api/attendance?date=${date}`);
    const data = await res.json();

    currentRecords = data.records || [];

    document.getElementById('recordPresent').textContent = data.present;
    document.getElementById('recordAbsent').textContent = data.absent;
    document.getElementById('recordRate').textContent = data.percentage + '%';
    document.getElementById('recordCount').textContent = `${currentRecords.length} Records`;

    renderRecords();
  } catch (err) {
    console.error('Load records error:', err);
    showToast('Failed to load records', 'error');
  }
}

function renderRecords() {
  const dept = document.getElementById('filterDept').value;
  let filtered = currentRecords;
  if (dept) filtered = filtered.filter(r => r.department === dept);

  const tbody = document.getElementById('recordsBody');
  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:2rem;">
      <div style="font-size:2rem;margin-bottom:0.5rem;">📭</div>
      <p style="color:var(--text-muted);">No records found</p>
    </td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map((r, i) => `
    <tr>
      <td>${i + 1}</td>
      <td style="font-weight:600;">${r.name || 'Unknown'}</td>
      <td>${r.roll_number || '-'}</td>
      <td>${r.department || '-'}</td>
      <td>${r.time || '-'}</td>
      <td><span class="badge badge-success">Present</span></td>
      <td>${r.confidence ? (r.confidence * 100).toFixed(1) + '%' : '-'}</td>
    </tr>`).join('');
}

function exportToCSV() {
  if (currentRecords.length === 0) { showToast('No records to export', 'warning'); return; }
  const date = document.getElementById('filterDate').value;
  const rows = [['#','Name','Roll Number','Department','Time','Status','Confidence']];
  currentRecords.forEach((r, i) => {
    rows.push([i+1, r.name, r.roll_number, r.department, r.time, 'Present',
      r.confidence ? (r.confidence*100).toFixed(1)+'%' : '-']);
  });
  const csv = rows.map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `attendance_${date}.csv`;
  a.click();
  showToast('CSV exported!', 'success');
}
