import { LedgerEntry, UserRole } from '../types';
import { formatCurrency } from '../lib/utils';
import { useMemo } from 'react';
import { Download, FileText } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface ProjectRevenueProps {
  entries: LedgerEntry[];
  userRole?: UserRole | null;
}

export default function ProjectRevenue({ entries, userRole }: ProjectRevenueProps) {
  const projectData = useMemo(() => {
    // Filter entries that are project revenue
    const revenueEntries = entries.filter(e => {
      let hasRevenue = false;
      (e.customEntries || []).forEach(ce => {
        if (ce.accountCategory === 'Equity') {
          const name = ce.accountName.toLowerCase();
          if (name.includes('revenue') || name.includes('income') || name.includes('sales')) {
            hasRevenue = true;
          }
        }
      });
      
      const details = e.details.toLowerCase();
      const itemName = e.transactionItemName.toLowerCase();
      const remarks = e.remarks.toLowerCase();
      const notes = (e.notes || '').toLowerCase();
      
      // Flexible detection:
      // - Explicitly mentioned "project"
      // - Project code pattern "TT-LG"
      // - Revenue entry with a specific remark (usually the project name)
      const isProjectRelated = 
        details.includes('project') || 
        itemName.includes('project') || 
        remarks.includes('tt-lg') ||
        notes.includes('tt-lg') ||
        remarks.includes('project') ||
        ((details.includes('revenue') || itemName.includes('revenue') || details.includes('income') || details.includes('sales')) && e.remarks.length > 0);
      
      return hasRevenue && isProjectRelated;
    });

    const projects = new Set<string>();
    const months = new Set<string>();
    const dataMap: Record<string, Record<string, number>> = {};

    revenueEntries.forEach(entry => {
      const date = new Date(entry.date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const projectName = entry.remarks || 'General Project';

      projects.add(projectName);
      months.add(monthKey);

      if (!dataMap[projectName]) {
        dataMap[projectName] = {};
      }
      
      let entryRevenue = 0;
      (entry.customEntries || []).forEach(ce => {
        if (ce.accountCategory === 'Equity') {
          const name = ce.accountName.toLowerCase();
          if (name.includes('revenue') || name.includes('income') || name.includes('sales')) {
            entryRevenue += ce.type === 'Cr' ? ce.amount : -ce.amount;
          }
        }
      });
      
      dataMap[projectName][monthKey] = (dataMap[projectName][monthKey] || 0) + entryRevenue;
    });

    // Sort months chronologically
    const sortedMonthKeys = Array.from(months).sort((a, b) => a.localeCompare(b));
    const sortedProjects = Array.from(projects).sort();

    const monthLabels = sortedMonthKeys.map(key => {
      const [year, month] = key.split('-');
      return new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    });

    return {
      projects: sortedProjects,
      monthKeys: sortedMonthKeys,
      monthLabels,
      dataMap
    };
  }, [entries]);

  if (projectData.projects.length === 0) {
    return (
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <h3 className="font-bold text-slate-800 mb-4">Project Revenue</h3>
        <p className="text-sm text-slate-500 italic">No project revenue recorded yet. Ensure the transaction item or details mention "Project" or select a project in the Remarks field.</p>
      </div>
    );
  }

  const { projects, monthKeys, monthLabels, dataMap } = projectData;

  const downloadXLS = () => {
    const header = ['Sl', 'Project Name', ...monthLabels];
    const rows = projects.map((project, idx) => {
      const row = [idx + 1, project];
      monthKeys.forEach(key => {
        row.push(dataMap[project][key] || 0);
      });
      return row;
    });

    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Project Revenue');
    XLSX.writeFile(wb, `Project_Revenue_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const downloadPDF = () => {
    const doc = new jsPDF('l', 'mm', 'a4');
    doc.setFontSize(18);
    doc.text('Project Revenue Report', 14, 22);
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 30);

    const header = ['Sl', 'Project Name', ...monthLabels];
    const rows = projects.map((project, idx) => {
      const row = [idx + 1, project];
      monthKeys.forEach(key => {
        row.push(formatCurrency(dataMap[project][key] || 0, true));
      });
      return row;
    });

    autoTable(doc, {
      startY: 35,
      head: [header],
      body: rows,
      theme: 'grid',
      headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255] },
      styles: { fontSize: 8 },
    });

    doc.save(`Project_Revenue_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="font-bold text-slate-800">Project Revenue</h3>
          <p className="text-xs text-slate-500 font-medium">Monthly revenue breakdown by project</p>
        </div>
        {userRole === 'admin' && (
          <div className="flex items-center gap-2">
            <button 
              onClick={downloadXLS}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-lg text-xs font-bold transition-colors"
            >
              <Download size={14} />
              XLS
            </button>
            <button 
              onClick={downloadPDF}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-lg text-xs font-bold transition-colors"
            >
              <FileText size={14} />
              PDF
            </button>
          </div>
        )}
      </div>
      <div className="overflow-x-auto custom-scrollbar pb-2">
        <table className="w-full text-left border-collapse min-w-[800px]">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="pb-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest w-12 text-center">Sl</th>
              <th className="pb-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest min-w-[200px] sticky left-0 bg-white z-10">Project Name</th>
              {monthLabels.map((label, idx) => (
                <th key={idx} className="pb-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right min-w-[120px] px-4">{label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {projects.map((project, idx) => (
              <tr key={project} className="group hover:bg-slate-50 transition-colors">
                <td className="py-4 text-sm font-medium text-slate-500 text-center">{idx + 1}</td>
                <td className="py-4 text-sm font-bold text-slate-900 sticky left-0 bg-white group-hover:bg-slate-50 z-10 border-r border-transparent group-hover:border-slate-100 transition-colors">
                  {project}
                </td>
                {monthKeys.map(key => (
                  <td key={key} className="py-4 text-sm font-bold text-emerald-600 text-right px-4">
                    {dataMap[project][key] ? formatCurrency(dataMap[project][key]) : '-'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
