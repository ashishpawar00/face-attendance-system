// ═══════════════════════════════════════════
//  records.js — Phase 4: Search + PDF + Excel
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
  const searchInput = document.getElementById('searchInput');
  const exportCSV = document.getElementById('exportCSV');
  const exportPDF = document.getElementById('exportPDF');
  const exportExcel = document.getElementById('exportExcel');

  // Default to today
  filterDate.value = new Date().toISOString().split('T')[0];

  filterDate.addEventListener('change', loadRecords);
  filterDept.addEventListener('change', renderRecords);

  // Live search
  if (searchInput) {
    searchInput.addEventListener('input', renderRecords);
  }

  if (exportCSV) exportCSV.addEventListener('click', doExportCSV);
  if (exportPDF) exportPDF.addEventListener('click', doExportPDF);
  if (exportExcel) exportExcel.addEventListener('click', doExportExcel);

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

function getFilteredRecords() {
  const dept = document.getElementById('filterDept').value;
  const search = (document.getElementById('searchInput')?.value || '').toLowerCase().trim();

  let filtered = currentRecords;
  if (dept) filtered = filtered.filter(r => r.department === dept);
  if (search) {
    filtered = filtered.filter(r =>
      (r.name || '').toLowerCase().includes(search) ||
      (r.roll_number || '').toLowerCase().includes(search)
    );
  }
  return filtered;
}

function renderRecords() {
  const filtered = getFilteredRecords();
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

// ═══════════════════════════════════════════
//  CSV Export
// ═══════════════════════════════════════════
function doExportCSV() {
  const filtered = getFilteredRecords();
  if (filtered.length === 0) { showToast('No records to export', 'warning'); return; }

  const date = document.getElementById('filterDate').value;
  const rows = [['#', 'Name', 'Roll Number', 'Department', 'Time', 'Status', 'Confidence']];
  filtered.forEach((r, i) => {
    rows.push([i + 1, r.name, r.roll_number, r.department, r.time, 'Present',
      r.confidence ? (r.confidence * 100).toFixed(1) + '%' : '-']);
  });

  const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
  downloadBlob(csv, `attendance_${date}.csv`, 'text/csv');
  showToast('CSV exported!', 'success');
}

// ═══════════════════════════════════════════
//  PDF Export (jsPDF + AutoTable)
// ═══════════════════════════════════════════
function doExportPDF() {
  const filtered = getFilteredRecords();
  if (filtered.length === 0) { showToast('No records to export', 'warning'); return; }

  const date = document.getElementById('filterDate').value;

  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // Header
    doc.setFontSize(18);
    doc.setTextColor(99, 102, 241); // indigo
    doc.text('FaceAttend', 14, 20);

    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Attendance Report — ${date}`, 14, 28);

    // Summary line
    const present = document.getElementById('recordPresent').textContent;
    const absent = document.getElementById('recordAbsent').textContent;
    const rate = document.getElementById('recordRate').textContent;
    doc.setFontSize(10);
    doc.setTextColor(60);
    doc.text(`Present: ${present} | Absent: ${absent} | Rate: ${rate}`, 14, 36);

    // Table
    const headers = [['#', 'Name', 'Roll No', 'Department', 'Time', 'Status', 'Confidence']];
    const body = filtered.map((r, i) => [
      i + 1,
      r.name || 'Unknown',
      r.roll_number || '-',
      r.department || '-',
      r.time || '-',
      'Present',
      r.confidence ? (r.confidence * 100).toFixed(1) + '%' : '-'
    ]);

    doc.autoTable({
      head: headers,
      body: body,
      startY: 42,
      theme: 'grid',
      headStyles: {
        fillColor: [99, 102, 241],
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 9
      },
      bodyStyles: { fontSize: 8.5 },
      alternateRowStyles: { fillColor: [245, 247, 250] },
      margin: { left: 14, right: 14 },
      styles: { cellPadding: 3 }
    });

    // Footer
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(`Generated by FaceAttend | Page ${i} of ${pageCount}`,
        doc.internal.pageSize.width / 2, doc.internal.pageSize.height - 10, { align: 'center' });
    }

    doc.save(`attendance_${date}.pdf`);
    showToast('PDF exported!', 'success');
  } catch (err) {
    console.error('PDF export error:', err);
    showToast('PDF export failed. Check console.', 'error');
  }
}

// ═══════════════════════════════════════════
//  Excel Export (SheetJS / XLSX)
// ═══════════════════════════════════════════
function doExportExcel() {
  const filtered = getFilteredRecords();
  if (filtered.length === 0) { showToast('No records to export', 'warning'); return; }

  const date = document.getElementById('filterDate').value;

  try {
    const headers = ['#', 'Name', 'Roll Number', 'Department', 'Time', 'Status', 'Confidence'];
    const rows = filtered.map((r, i) => [
      i + 1,
      r.name || 'Unknown',
      r.roll_number || '-',
      r.department || '-',
      r.time || '-',
      'Present',
      r.confidence ? (r.confidence * 100).toFixed(1) + '%' : '-'
    ]);

    const wsData = [headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Column widths
    ws['!cols'] = [
      { wch: 5 },  // #
      { wch: 22 }, // Name
      { wch: 15 }, // Roll
      { wch: 22 }, // Dept
      { wch: 12 }, // Time
      { wch: 10 }, // Status
      { wch: 12 }, // Confidence
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Attendance');
    XLSX.writeFile(wb, `attendance_${date}.xlsx`);
    showToast('Excel exported!', 'success');
  } catch (err) {
    console.error('Excel export error:', err);
    showToast('Excel export failed. Check console.', 'error');
  }
}

// ═════ Utility ═════
function downloadBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
