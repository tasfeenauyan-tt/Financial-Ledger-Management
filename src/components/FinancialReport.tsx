import React, { useState, useMemo } from 'react';
import { LedgerEntry, Client, UserRole } from '../types';
import { formatCurrency, cn } from '../lib/utils';
import { 
  Download, 
  FileText, 
  Calendar, 
  TrendingUp, 
  TrendingDown, 
  Target, 
  Filter,
  ChevronDown,
  Wand2,
  PieChart
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Document, Packer, Paragraph, Table, TableRow, TableCell, WidthType, AlignmentType, HeadingLevel, TextRun, BorderStyle } from 'docx';
import { saveAs } from 'file-saver';
import ServiceRevenue from './ServiceRevenue';
import ClientRevenue from './ClientRevenue';
import CountryRevenue from './CountryRevenue';

import { getServiceRevenueData, getClientRevenueData, getCountryRevenueData } from '../lib/revenueDataHelpers';

interface FinancialReportProps {
  entries: LedgerEntry[];
  clients: Client[];
  userRole?: UserRole | null;
}

type PeriodType = 'monthly' | 'quarterly' | 'yearly' | 'upto-now' | 'custom';

interface ReportData {
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  margin: number;
  revenueByProject: Record<string, { total: number; monthly: Record<string, number>; type: 'Recurring' | 'Non-Recurring' }>;
  expensesByCategory: Record<string, { total: number; monthly: Record<string, number> }>;
  monthlySummary: Record<string, { revenue: number; expense: number; margin: number }>;
  months: string[];
}

export default function FinancialReport({ entries, clients, userRole }: FinancialReportProps) {
  const [periodType, setPeriodType] = useState<PeriodType>('upto-now');
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth());
  const [selectedQuarter, setSelectedQuarter] = useState<number>(Math.floor(new Date().getMonth() / 3) + 1);
  const [customStart, setCustomStart] = useState<string>(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]);
  const [customEnd, setCustomEnd] = useState<string>(new Date().toISOString().split('T')[0]);

  const reportConfig = useMemo(() => {
    let start: Date;
    let end: Date;
    let title = '';
    let subtitle = '';

    if (periodType === 'monthly') {
      start = new Date(selectedYear, selectedMonth, 1);
      end = new Date(selectedYear, selectedMonth + 1, 0);
      title = `Monthly Financial Report - ${start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`;
      subtitle = start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    } else if (periodType === 'quarterly') {
      const qStartMonth = (selectedQuarter - 1) * 3;
      start = new Date(selectedYear, qStartMonth, 1);
      end = new Date(selectedYear, qStartMonth + 3, 0);
      title = `Quarterly Financial Report - Q${selectedQuarter} ${selectedYear}`;
      subtitle = `${start.toLocaleDateString('en-US', { month: 'short' })}–${end.toLocaleDateString('en-US', { month: 'short' })} ${selectedYear}`;
    } else if (periodType === 'yearly') {
      start = new Date(selectedYear, 0, 1);
      end = new Date(selectedYear, 11, 31);
      title = `Yearly Financial Report - ${selectedYear}`;
      subtitle = `January–December ${selectedYear}`;
    } else if (periodType === 'upto-now') {
      // Find the earliest entry date
      const earliestDate = entries.length > 0 
        ? new Date(Math.min(...entries.map(e => new Date(e.date).getTime())))
        : new Date();
      start = earliestDate;
      end = new Date();
      title = `Cumulative Financial Report - Up to ${end.toLocaleDateString()}`;
      subtitle = `${start.toLocaleDateString()} – ${end.toLocaleDateString()}`;
    } else {
      start = new Date(customStart);
      end = new Date(customEnd);
      title = `Custom Period Financial Report`;
      subtitle = `${start.toLocaleDateString()} – ${end.toLocaleDateString()}`;
    }

    return { start, end, title, subtitle };
  }, [periodType, selectedYear, selectedMonth, selectedQuarter, customStart, customEnd, entries]);

  const filteredEntries = useMemo(() => {
    const { start, end } = reportConfig;
    return entries.filter(e => {
      // For monthly views, string-based prefix matching is more reliable against TZ shifts
      if (periodType === 'monthly') {
        const entryMonth = e.date.substring(0, 7);
        const targetMonth = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;
        return entryMonth === targetMonth;
      }
      if (periodType === 'quarterly') {
        const entryMonth = e.date.substring(0, 7);
        const month = parseInt(entryMonth.split('-')[1]);
        const year = parseInt(entryMonth.split('-')[0]);
        const q = Math.floor((month - 1) / 3) + 1;
        return year === selectedYear && q === selectedQuarter;
      }
      if (periodType === 'yearly') {
        return e.date.startsWith(String(selectedYear));
      }
      
      const d = new Date(e.date);
      return d >= start && d <= end;
    });
  }, [entries, reportConfig, periodType, selectedYear, selectedMonth, selectedQuarter]);

  const reportData: ReportData = useMemo(() => {
    let totalRevenue = 0;
    let totalExpenses = 0;

    const revenueByProject: Record<string, { total: number; monthly: Record<string, number>; type: 'Recurring' | 'Non-Recurring' }> = {};
    const expensesByCategory: Record<string, { total: number; monthly: Record<string, number> }> = {};
    const monthlySummary: Record<string, { revenue: number; expense: number; margin: number }> = {};

    // Get unique months in the period
    const months: string[] = [];
    const dateIter = new Date(reportConfig.start);
    while (dateIter <= reportConfig.end) {
      const mKey = `${dateIter.getFullYear()}-${String(dateIter.getMonth() + 1).padStart(2, '0')}`;
      if (!months.includes(mKey)) months.push(mKey);
      dateIter.setMonth(dateIter.getMonth() + 1);
    }

    filteredEntries.forEach(entry => {
      const mKey = entry.date.substring(0, 7);
      
      let entryRevenue = 0;
      let entryExpense = 0;

      (entry.customEntries || []).forEach(ce => {
        const lowerName = ce.accountName.toLowerCase();
        const isEquity = ce.accountCategory === 'Equity';
        const isCapital = lowerName.includes('capital') || lowerName.includes('partner') || lowerName.includes('owner') || lowerName.includes('drawing');
        
        // Comprehensive revenue keywords
        const isRevKeywords = lowerName.includes('revenue') || lowerName.includes('income') || lowerName.includes('sales') || 
                            lowerName.includes('fees') || lowerName.includes('service') || lowerName.includes('billing') ||
                            lowerName.includes('retainer') || lowerName.includes('commission');
        
        // Comprehensive expense keywords
        const isExpKeywords = lowerName.includes('expense') || lowerName.includes('cost') || lowerName.includes('salary') || 
                            lowerName.includes('rent') || lowerName.includes('bill') || lowerName.includes('tax') || 
                            lowerName.includes('utility') || lowerName.includes('purchase') || lowerName.includes('wage') ||
                            lowerName.includes('travel') || lowerName.includes('marketing') || lowerName.includes('allowance');

        // Logic sync with P&L: Equity accounts that aren't Capital
        if (isRevKeywords || (isEquity && !isCapital && ce.type === 'Cr')) {
          entryRevenue += ce.type === 'Cr' ? ce.amount : -ce.amount;
        } else if (isExpKeywords || (isEquity && !isCapital && ce.type === 'Dr')) {
          entryExpense += ce.type === 'Dr' ? ce.amount : -ce.amount;
        }
      });

      totalRevenue += entryRevenue;
      totalExpenses += entryExpense;

      if (!monthlySummary[mKey]) monthlySummary[mKey] = { revenue: 0, expense: 0, margin: 0 };
      monthlySummary[mKey].revenue += entryRevenue;
      monthlySummary[mKey].expense += entryExpense;

      if (entryRevenue !== 0) {
        // Find project name: check remarks first, then falls back to transaction item name if it contains "Revenue:"
        let projectName = 'Other Revenue';
        if (entry.remarks && entry.remarks.trim().length > 0) {
          projectName = entry.remarks;
        } else if (entry.transactionItemName && entry.transactionItemName.includes(':')) {
          projectName = entry.transactionItemName.split(':').pop()?.trim() || entry.transactionItemName;
        }

        const client = clients.find(c => 
          c.projectName?.toLowerCase() === projectName.toLowerCase() || 
          c.name?.toLowerCase() === projectName.toLowerCase() ||
          projectName.toLowerCase().includes(c.name?.toLowerCase() || '~~~~')
        );
        
        const type = client?.clientType || 'Non-Recurring';

        if (!revenueByProject[projectName]) {
          revenueByProject[projectName] = { total: 0, monthly: {}, type };
        }
        revenueByProject[projectName].total += entryRevenue;
        revenueByProject[projectName].monthly[mKey] = (revenueByProject[projectName].monthly[mKey] || 0) + entryRevenue;
      }

      if (entryExpense !== 0) {
        const category = entry.transactionItemName || 'Other Expenses';
        if (!expensesByCategory[category]) {
          expensesByCategory[category] = { total: 0, monthly: {} };
        }
        expensesByCategory[category].total += entryExpense;
        expensesByCategory[category].monthly[mKey] = (expensesByCategory[category].monthly[mKey] || 0) + entryExpense;
      }
    });

    Object.keys(monthlySummary).forEach(m => {
      const { revenue, expense } = monthlySummary[m];
      monthlySummary[m].margin = revenue > 0 ? ((revenue - expense) / revenue) * 100 : 0;
    });

    const netProfit = totalRevenue - totalExpenses;
    const margin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

    return {
      totalRevenue,
      totalExpenses,
      netProfit,
      margin,
      revenueByProject,
      expensesByCategory,
      monthlySummary,
      months
    };
  }, [filteredEntries, reportConfig, clients]);

  const downloadPDF = () => {
    const doc = new jsPDF('p', 'mm', 'a4');
    const { title, subtitle } = reportConfig;
    const { totalRevenue, totalExpenses, netProfit, margin, revenueByProject, expensesByCategory, monthlySummary, months } = reportData;

    // Header
    doc.setFontSize(20);
    doc.setTextColor(17, 24, 39);
    doc.text('TriloyTech', 105, 15, { align: 'center' });
    doc.setFontSize(14);
    doc.text(title, 105, 22, { align: 'center' });
    doc.setFontSize(10);
    doc.text(`Period: ${subtitle}`, 105, 28, { align: 'center' });
    doc.text(`Prepared On: ${new Date().toLocaleString()}`, 105, 34, { align: 'center' });

    let y = 45;

    // 1. Executive Summary
    doc.setFontSize(12);
    doc.text('1. Executive Summary', 14, y);
    y += 5;
    autoTable(doc, {
      startY: y,
      body: [
        ['Total Revenue', formatCurrency(totalRevenue, true)],
        ['Total Expenses', formatCurrency(totalExpenses, true)],
        ['Net Profit/Loss', formatCurrency(netProfit, true)],
        ['Net Profit Margin', `${margin.toFixed(2)}%`]
      ],
      theme: 'plain',
      styles: { fontSize: 10, cellPadding: 1 },
      columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } }
    });
    y = (doc as any).lastAutoTable.finalY + 10;

    // 2. Revenue Summary
    doc.text('2. Revenue Summary', 14, y);
    y += 5;
    const revHeader = ['Category', 'Project/Client', ...months.map(m => new Date(m + '-01').toLocaleDateString('en-US', { month: 'short' })), 'Total'];
    const revRows = Object.entries(revenueByProject).map(([name, data]) => [
      data.type,
      name,
      ...months.map(m => formatCurrency(data.monthly[m] || 0, true)),
      formatCurrency(data.total, true)
    ]);
    revRows.push(['Total Revenue', '', ...months.map(m => formatCurrency(monthlySummary[m]?.revenue || 0, true)), formatCurrency(totalRevenue, true)]);

    autoTable(doc, {
      startY: y,
      head: [revHeader],
      body: revRows,
      theme: 'grid',
      styles: { fontSize: 7 },
      headStyles: { fillColor: [79, 70, 229] },
      didParseCell: (data) => {
        if (data.row.index === revRows.length - 1) data.cell.styles.fontStyle = 'bold';
      }
    });
    y = (doc as any).lastAutoTable.finalY + 10;

    // 3. Operating Expenses
    if (y > 240) { doc.addPage(); y = 20; }
    doc.text('3. Operating Expenses (OPEX)', 14, y);
    y += 5;
    const expHeader = ['Category', ...months.map(m => new Date(m + '-01').toLocaleDateString('en-US', { month: 'short' })), 'Total'];
    const expRows = Object.entries(expensesByCategory).map(([cat, data]) => [
      cat,
      ...months.map(m => formatCurrency(data.monthly[m] || 0, true)),
      formatCurrency(data.total, true)
    ]);
    expRows.push(['Total OPEX', ...months.map(m => formatCurrency(monthlySummary[m]?.expense || 0, true)), formatCurrency(totalExpenses, true)]);

    autoTable(doc, {
      startY: y,
      head: [expHeader],
      body: expRows,
      theme: 'grid',
      styles: { fontSize: 8 },
      headStyles: { fillColor: [79, 70, 229] },
      didParseCell: (data) => {
        if (data.row.index === expRows.length - 1) data.cell.styles.fontStyle = 'bold';
      }
    });
    y = (doc as any).lastAutoTable.finalY + 10;

    // 4. Net Profit / Loss
    if (y > 240) { doc.addPage(); y = 20; }
    doc.text('4. Net Profit / Loss', 14, y);
    y += 5;
    const netRows = months.map(m => [
      new Date(m + '-01').toLocaleDateString('en-US', { month: 'short' }),
      formatCurrency(monthlySummary[m]?.revenue || 0, true),
      formatCurrency(monthlySummary[m]?.expense || 0, true),
      formatCurrency(monthlySummary[m]?.revenue - monthlySummary[m]?.expense, true),
      `${monthlySummary[m]?.margin.toFixed(2)}%`
    ]);
    netRows.push(['Total', formatCurrency(totalRevenue, true), formatCurrency(totalExpenses, true), formatCurrency(netProfit, true), `${(totalRevenue > 0 ? (netProfit/totalRevenue)*100 : 0).toFixed(2)}%`]);

    autoTable(doc, {
      startY: y,
      head: [['Month', 'Revenue', 'Expense', 'Net Amount', 'Margin']],
      body: netRows,
      theme: 'grid',
      styles: { fontSize: 9 },
      headStyles: { fillColor: [79, 70, 229] },
      didParseCell: (data) => {
        if (data.row.index === netRows.length - 1) data.cell.styles.fontStyle = 'bold';
      }
    });
    y = (doc as any).lastAutoTable.finalY + 10;

    // 5. Revenue Analysis (Service, Client, Country)
    if (y > 230) { doc.addPage(); y = 20; }
    doc.text('5. Revenue Analysis', 14, y);
    y += 8;

    // 5.1 Service Revenue
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text('5.1 Service Revenue Breakdown', 14, y);
    y += 5;
    const serviceData = getServiceRevenueData(filteredEntries);
    if (serviceData.items.length > 0) {
      const sHead = ['Sl', 'Service Name', ...serviceData.monthLabels, 'Total', '%'];
      const sRows = serviceData.items.map((item, idx) => [
        idx + 1,
        item,
        ...serviceData.monthKeys.map(m => formatCurrency(serviceData.dataMap[item][m] || 0, true)),
        formatCurrency(serviceData.rowTotals[item], true),
        serviceData.grandTotal > 0 ? ((serviceData.rowTotals[item] / serviceData.grandTotal) * 100).toFixed(1) + '%' : '0%'
      ]);
      sRows.push(['', 'Total', ...serviceData.monthKeys.map(m => formatCurrency(serviceData.colTotals[m] || 0, true)), formatCurrency(serviceData.grandTotal, true), '100%']);
      
      autoTable(doc, {
        startY: y,
        head: [sHead],
        body: sRows,
        theme: 'grid',
        styles: { fontSize: 7 },
        headStyles: { fillColor: [16, 185, 129] },
        didParseCell: (data) => {
          if (data.row.index === sRows.length - 1) data.cell.styles.fontStyle = 'bold';
        }
      });
      y = (doc as any).lastAutoTable.finalY + 10;
    } else {
      doc.setFontSize(9);
      doc.text('No service revenue data available for this period.', 14, y);
      y += 10;
    }

    // 5.2 Client Revenue
    if (y > 230) { doc.addPage(); y = 20; }
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text('5.2 Client Revenue Breakdown', 14, y);
    y += 5;
    const clData = getClientRevenueData(filteredEntries);
    if (clData.items.length > 0) {
      const cHead = ['Sl', 'Client ID', ...clData.monthLabels, 'Total', '%'];
      const cRows = clData.items.map((item, idx) => [
        idx + 1,
        item,
        ...clData.monthKeys.map(m => formatCurrency(clData.dataMap[item][m] || 0, true)),
        formatCurrency(clData.rowTotals[item], true),
        clData.grandTotal > 0 ? ((clData.rowTotals[item] / clData.grandTotal) * 100).toFixed(1) + '%' : '0%'
      ]);
      cRows.push(['', 'Total', ...clData.monthKeys.map(m => formatCurrency(clData.colTotals[m] || 0, true)), formatCurrency(clData.grandTotal, true), '100%']);

      autoTable(doc, {
        startY: y,
        head: [cHead],
        body: cRows,
        theme: 'grid',
        styles: { fontSize: 7 },
        headStyles: { fillColor: [59, 130, 246] },
        didParseCell: (data) => {
          if (data.row.index === cRows.length - 1) data.cell.styles.fontStyle = 'bold';
        }
      });
      y = (doc as any).lastAutoTable.finalY + 10;
    } else {
      doc.setFontSize(9);
      doc.text('No client revenue data available for this period.', 14, y);
      y += 10;
    }

    // 5.3 Country Revenue
    if (y > 230) { doc.addPage(); y = 20; }
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text('5.3 Country Revenue Breakdown', 14, y);
    y += 5;
    const coData = getCountryRevenueData(filteredEntries, clients);
    if (coData.items.length > 0) {
      const coHead = ['Sl', 'Country', ...coData.monthLabels, 'Total', '%'];
      const coRows = coData.items.map((item, idx) => [
        idx + 1,
        item,
        ...coData.monthKeys.map(m => formatCurrency(coData.dataMap[item][m] || 0, true)),
        formatCurrency(coData.rowTotals[item], true),
        coData.grandTotal > 0 ? ((coData.rowTotals[item] / coData.grandTotal) * 100).toFixed(1) + '%' : '0%'
      ]);
      coRows.push(['', 'Total', ...coData.monthKeys.map(m => formatCurrency(coData.colTotals[m] || 0, true)), formatCurrency(coData.grandTotal, true), '100%']);

      autoTable(doc, {
        startY: y,
        head: [coHead],
        body: coRows,
        theme: 'grid',
        styles: { fontSize: 7 },
        headStyles: { fillColor: [139, 92, 246] },
        didParseCell: (data) => {
          if (data.row.index === coRows.length - 1) data.cell.styles.fontStyle = 'bold';
        }
      });
    } else {
      doc.setFontSize(9);
      doc.text('No country revenue data available for this period.', 14, y);
    }

    doc.save(`${title.replace(/ /g, '_')}.pdf`);
  };

  const downloadDOC = async () => {
    const { title, subtitle } = reportConfig;
    const { totalRevenue, totalExpenses, netProfit, margin, revenueByProject, expensesByCategory, monthlySummary, months } = reportData;

    const sData = getServiceRevenueData(filteredEntries);
    const cData = getClientRevenueData(filteredEntries);
    const coData = getCountryRevenueData(filteredEntries, clients);

    const sections = [
      new Paragraph({ text: 'TriloyTech', heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER }),
      new Paragraph({ text: title, heading: HeadingLevel.HEADING_2, alignment: AlignmentType.CENTER }),
      new Paragraph({ text: `Period: ${subtitle}`, alignment: AlignmentType.CENTER }),
      new Paragraph({ text: `Prepared On: ${new Date().toLocaleString()}`, alignment: AlignmentType.CENTER }),
      
      new Paragraph({ text: '', spacing: { before: 200 } }),
      new Paragraph({ text: '1. Executive Summary', heading: HeadingLevel.HEADING_3 }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({ children: [new TableCell({ children: [new Paragraph('Total Revenue')] }), new TableCell({ children: [new Paragraph(formatCurrency(totalRevenue, true))] })] }),
          new TableRow({ children: [new TableCell({ children: [new Paragraph('Total Expenses')] }), new TableCell({ children: [new Paragraph(formatCurrency(totalExpenses, true))] })] }),
          new TableRow({ children: [new TableCell({ children: [new Paragraph('Net Profit/Loss')] }), new TableCell({ children: [new Paragraph(formatCurrency(netProfit, true))] })] }),
          new TableRow({ children: [new TableCell({ children: [new Paragraph('Net Profit Margin')] }), new TableCell({ children: [new Paragraph(`${margin.toFixed(2)}%`)] })] }),
        ]
      }),

      new Paragraph({ text: '', spacing: { before: 400 } }),
      new Paragraph({ text: '2. Revenue Summary', heading: HeadingLevel.HEADING_3 }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              new TableCell({ children: [new Paragraph('Category')] }),
              new TableCell({ children: [new Paragraph('Project/Client')] }),
              ...months.map(m => new TableCell({ children: [new Paragraph(new Date(m + '-01').toLocaleDateString('en-US', { month: 'short' }))] })),
              new TableCell({ children: [new Paragraph('Total')] }),
            ]
          }),
          ...Object.entries(revenueByProject).map(([name, data]) => new TableRow({
            children: [
              new TableCell({ children: [new Paragraph(data.type)] }),
              new TableCell({ children: [new Paragraph(name)] }),
              ...months.map(m => new TableCell({ children: [new Paragraph(formatCurrency(data.monthly[m] || 0, true))] })),
              new TableCell({ children: [new Paragraph(formatCurrency(data.total, true))] }),
            ]
          })),
          new TableRow({
            children: [
              new TableCell({ children: [new Paragraph('Total Revenue')] }),
              new TableCell({ children: [new Paragraph('')] }),
              ...months.map(m => new TableCell({ children: [new Paragraph(formatCurrency(monthlySummary[m]?.revenue || 0, true))] })),
              new TableCell({ children: [new Paragraph(formatCurrency(totalRevenue, true))] }),
            ]
          })
        ]
      }),

      new Paragraph({ text: '', spacing: { before: 400 } }),
      new Paragraph({ text: '3. Operating Expenses (OPEX)', heading: HeadingLevel.HEADING_3 }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              new TableCell({ children: [new Paragraph('Category')] }),
              ...months.map(m => new TableCell({ children: [new Paragraph(new Date(m + '-01').toLocaleDateString('en-US', { month: 'short' }))] })),
              new TableCell({ children: [new Paragraph('Total')] }),
            ]
          }),
          ...Object.entries(expensesByCategory).map(([cat, data]) => new TableRow({
            children: [
              new TableCell({ children: [new Paragraph(cat)] }),
              ...months.map(m => new TableCell({ children: [new Paragraph(formatCurrency(data.monthly[m] || 0, true))] })),
              new TableCell({ children: [new Paragraph(formatCurrency(data.total, true))] }),
            ]
          })),
          new TableRow({
            children: [
              new TableCell({ children: [new Paragraph('Total OPEX')] }),
              ...months.map(m => new TableCell({ children: [new Paragraph(formatCurrency(monthlySummary[m]?.expense || 0, true))] })),
              new TableCell({ children: [new Paragraph(formatCurrency(totalExpenses, true))] }),
            ]
          })
        ]
      }),

      new Paragraph({ text: '', spacing: { before: 400 } }),
      new Paragraph({ text: '4. Net Profit / Loss', heading: HeadingLevel.HEADING_3 }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              new TableCell({ children: [new Paragraph('Month')] }),
              new TableCell({ children: [new Paragraph('Revenue')] }),
              new TableCell({ children: [new Paragraph('Expense')] }),
              new TableCell({ children: [new Paragraph('Net Amount')] }),
              new TableCell({ children: [new Paragraph('Margin')] }),
            ]
          }),
          ...months.map(m => new TableRow({
            children: [
              new TableCell({ children: [new Paragraph(new Date(m + '-01').toLocaleDateString('en-US', { month: 'short' }))] }),
              new TableCell({ children: [new Paragraph(formatCurrency(monthlySummary[m]?.revenue || 0, true))] }),
              new TableCell({ children: [new Paragraph(formatCurrency(monthlySummary[m]?.expense || 0, true))] }),
              new TableCell({ children: [new Paragraph(formatCurrency(monthlySummary[m]?.revenue - monthlySummary[m]?.expense, true))] }),
              new TableCell({ children: [new Paragraph(`${monthlySummary[m]?.margin.toFixed(2)}%`)] }),
            ]
          })),
          new TableRow({
            children: [
              new TableCell({ children: [new Paragraph('Total')] }),
              new TableCell({ children: [new Paragraph(formatCurrency(totalRevenue, true))] }),
              new TableCell({ children: [new Paragraph(formatCurrency(totalExpenses, true))] }),
              new TableCell({ children: [new Paragraph(formatCurrency(netProfit, true))] }),
              new TableCell({ children: [new Paragraph(`${(totalRevenue > 0 ? (netProfit/totalRevenue)*100 : 0).toFixed(2)}%`)] }),
            ]
          })
        ]
      }),

      new Paragraph({ text: '', spacing: { before: 400 } }),
      new Paragraph({ text: '5. Revenue Analysis', heading: HeadingLevel.HEADING_3 }),
      
      new Paragraph({ text: '5.1 Service Revenue', heading: HeadingLevel.HEADING_4, spacing: { before: 200 } }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              new TableCell({ children: [new Paragraph('Sl')] }),
              new TableCell({ children: [new Paragraph('Service Name')] }),
              ...sData.monthLabels.map(l => new TableCell({ children: [new Paragraph(l)] })),
              new TableCell({ children: [new Paragraph('Total')] }),
              new TableCell({ children: [new Paragraph('%')] }),
            ]
          }),
          ...sData.items.map((item, idx) => new TableRow({
            children: [
              new TableCell({ children: [new Paragraph((idx + 1).toString())] }),
              new TableCell({ children: [new Paragraph(item)] }),
              ...sData.monthKeys.map(m => new TableCell({ children: [new Paragraph(formatCurrency(sData.dataMap[item][m] || 0, true))] })),
              new TableCell({ children: [new Paragraph(formatCurrency(sData.rowTotals[item], true))] }),
              new TableCell({ children: [new Paragraph(sData.grandTotal > 0 ? ((sData.rowTotals[item] / sData.grandTotal) * 100).toFixed(1) + '%' : '0%')] }),
            ]
          })),
          new TableRow({
            children: [
              new TableCell({ children: [new Paragraph('')] }),
              new TableCell({ children: [new Paragraph('Total')] }),
              ...sData.monthKeys.map(m => new TableCell({ children: [new Paragraph(formatCurrency(sData.colTotals[m] || 0, true))] })),
              new TableCell({ children: [new Paragraph(formatCurrency(sData.grandTotal, true))] }),
              new TableCell({ children: [new Paragraph('100%')] }),
            ]
          })
        ]
      }),

      new Paragraph({ text: '5.2 Client Revenue', heading: HeadingLevel.HEADING_4, spacing: { before: 300 } }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              new TableCell({ children: [new Paragraph('Sl')] }),
              new TableCell({ children: [new Paragraph('Client ID')] }),
              ...cData.monthLabels.map(l => new TableCell({ children: [new Paragraph(l)] })),
              new TableCell({ children: [new Paragraph('Total')] }),
              new TableCell({ children: [new Paragraph('%')] }),
            ]
          }),
          ...cData.items.map((item, idx) => new TableRow({
            children: [
              new TableCell({ children: [new Paragraph((idx + 1).toString())] }),
              new TableCell({ children: [new Paragraph(item)] }),
              ...cData.monthKeys.map(m => new TableCell({ children: [new Paragraph(formatCurrency(cData.dataMap[item][m] || 0, true))] })),
              new TableCell({ children: [new Paragraph(formatCurrency(cData.rowTotals[item], true))] }),
              new TableCell({ children: [new Paragraph(cData.grandTotal > 0 ? ((cData.rowTotals[item] / cData.grandTotal) * 100).toFixed(1) + '%' : '0%')] }),
            ]
          })),
          new TableRow({
            children: [
              new TableCell({ children: [new Paragraph('')] }),
              new TableCell({ children: [new Paragraph('Total')] }),
              ...cData.monthKeys.map(m => new TableCell({ children: [new Paragraph(formatCurrency(cData.colTotals[m] || 0, true))] })),
              new TableCell({ children: [new Paragraph(formatCurrency(cData.grandTotal, true))] }),
              new TableCell({ children: [new Paragraph('100%')] }),
            ]
          })
        ]
      }),

      new Paragraph({ text: '5.3 Country Revenue', heading: HeadingLevel.HEADING_4, spacing: { before: 300 } }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              new TableCell({ children: [new Paragraph('Sl')] }),
              new TableCell({ children: [new Paragraph('Country')] }),
              ...coData.monthLabels.map(l => new TableCell({ children: [new Paragraph(l)] })),
              new TableCell({ children: [new Paragraph('Total')] }),
              new TableCell({ children: [new Paragraph('%')] }),
            ]
          }),
          ...coData.items.map((item, idx) => new TableRow({
            children: [
              new TableCell({ children: [new Paragraph((idx + 1).toString())] }),
              new TableCell({ children: [new Paragraph(item)] }),
              ...coData.monthKeys.map(m => new TableCell({ children: [new Paragraph(formatCurrency(coData.dataMap[item][m] || 0, true))] })),
              new TableCell({ children: [new Paragraph(formatCurrency(coData.rowTotals[item], true))] }),
              new TableCell({ children: [new Paragraph(coData.grandTotal > 0 ? ((coData.rowTotals[item] / coData.grandTotal) * 100).toFixed(1) + '%' : '0%')] }),
            ]
          })),
          new TableRow({
            children: [
              new TableCell({ children: [new Paragraph('')] }),
              new TableCell({ children: [new Paragraph('Total')] }),
              ...coData.monthKeys.map(m => new TableCell({ children: [new Paragraph(formatCurrency(coData.colTotals[m] || 0, true))] })),
              new TableCell({ children: [new Paragraph(formatCurrency(coData.grandTotal, true))] }),
              new TableCell({ children: [new Paragraph('100%')] }),
            ]
          })
        ]
      })
    ];

    const doc = new Document({
      sections: [{
        children: sections,
      }],
    });

    const blob = await Packer.toBlob(doc);
    saveAs(blob, `${title.replace(/ /g, '_')}.docx`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-end gap-4">
        <div className="flex items-center gap-2">
          <button 
            onClick={downloadPDF}
            className="flex items-center gap-2 px-4 py-2.5 bg-rose-50 text-rose-600 rounded-xl font-bold hover:bg-rose-100 transition-all border border-rose-100 shadow-sm"
          >
            <Download size={18} />
            PDF
          </button>
          <button 
            onClick={downloadDOC}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-50 text-indigo-600 rounded-xl font-bold hover:bg-indigo-100 transition-all border border-indigo-100 shadow-sm"
          >
            <Wand2 size={18} />
            DOC
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex bg-slate-100/50 p-1 rounded-2xl">
            {(['monthly', 'quarterly', 'yearly', 'upto-now', 'custom'] as PeriodType[]).map(type => (
              <button
                key={type}
                onClick={() => setPeriodType(type)}
                className={cn(
                  "px-4 py-2 rounded-xl text-xs font-bold transition-all capitalize",
                  periodType === type ? "bg-white text-indigo-600 shadow-sm ring-1 ring-slate-200" : "text-slate-500 hover:text-slate-700"
                )}
              >
                {type.replace('-', ' ')}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {periodType !== 'upto-now' && periodType !== 'custom' && (
              <select 
                value={selectedYear}
                onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                className="px-3 py-2 bg-slate-50 border-none rounded-xl text-xs font-bold focus:ring-2 focus:ring-indigo-500"
              >
                {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            )}

            {periodType === 'monthly' && (
              <select 
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                className="px-3 py-2 bg-slate-50 border-none rounded-xl text-xs font-bold focus:ring-2 focus:ring-indigo-500"
              >
                {Array.from({ length: 12 }).map((_, i) => (
                  <option key={i} value={i}>{new Date(2024, i, 1).toLocaleDateString('en-US', { month: 'long' })}</option>
                ))}
              </select>
            )}

            {periodType === 'quarterly' && (
              <select 
                value={selectedQuarter}
                onChange={(e) => setSelectedQuarter(parseInt(e.target.value))}
                className="px-3 py-2 bg-slate-50 border-none rounded-xl text-xs font-bold focus:ring-2 focus:ring-indigo-500"
              >
                {[1, 2, 3, 4].map(q => <option key={q} value={q}>Quarter {q}</option>)}
              </select>
            )}

            {periodType === 'custom' && (
              <div className="flex items-center gap-2">
                <input 
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="px-3 py-2 bg-slate-50 border-none rounded-xl text-xs font-bold focus:ring-2 focus:ring-indigo-500"
                />
                <span className="text-slate-400 font-bold">to</span>
                <input 
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="px-3 py-2 bg-slate-50 border-none rounded-xl text-xs font-bold focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Report Content */}
      <div className="report-container space-y-8 bg-white p-8 lg:p-12 rounded-[2.5rem] border border-slate-100 shadow-sm print:border-none print:shadow-none print:p-0">
        <div className="text-center space-y-2 border-b border-slate-50 pb-8">
          <h3 className="text-2xl font-black text-slate-900 tracking-tight">TriloyTech</h3>
          <h4 className="text-xl font-bold text-indigo-600">{reportConfig.title}</h4>
          <p className="text-slate-400 font-semibold uppercase tracking-widest text-[10px]">
            Period: {reportConfig.subtitle} | Prepared on: {new Date().toLocaleDateString()}
          </p>
        </div>

        {/* 1. Executive Summary */}
        <section className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
              <span className="font-black text-sm">1</span>
            </div>
            <h5 className="text-lg font-bold text-slate-800">Executive Summary</h5>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            <div className="p-4 sm:p-6 bg-emerald-50/50 rounded-3xl border border-emerald-100 flex items-center gap-3 sm:gap-4">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
                <TrendingUp size={20} className="sm:w-6 sm:h-6" />
              </div>
              <div className="flex-1">
                <p className="text-[9px] sm:text-[10px] font-black text-emerald-600/60 uppercase tracking-widest">Total Revenue</p>
                <p className="text-lg sm:text-2xl font-black text-emerald-700">{formatCurrency(reportData.totalRevenue)}</p>
              </div>
            </div>
            <div className="p-4 sm:p-6 bg-rose-50/50 rounded-3xl border border-rose-100 flex items-center gap-3 sm:gap-4">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-rose-100 flex items-center justify-center text-rose-600 shrink-0">
                <TrendingDown size={20} className="sm:w-6 sm:h-6" />
              </div>
              <div className="flex-1">
                <p className="text-[9px] sm:text-[10px] font-black text-rose-600/60 uppercase tracking-widest">Total Expenses</p>
                <p className="text-lg sm:text-2xl font-black text-rose-700">{formatCurrency(reportData.totalExpenses)}</p>
              </div>
            </div>
            <div className="p-4 sm:p-6 bg-indigo-50/50 rounded-3xl border border-indigo-100 flex items-center gap-3 sm:gap-4">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                <Target size={20} className="sm:w-6 sm:h-6" />
              </div>
              <div className="flex-1">
                <p className="text-[9px] sm:text-[10px] font-black text-indigo-600/60 uppercase tracking-widest">Net Profit/Loss</p>
                <p className={cn("text-lg sm:text-2xl font-black", reportData.netProfit >= 0 ? "text-indigo-700" : "text-rose-700")}>
                  {formatCurrency(reportData.netProfit)}
                </p>
              </div>
            </div>
            <div className="p-4 sm:p-6 bg-amber-50/50 rounded-3xl border border-amber-100 flex items-center gap-3 sm:gap-4">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-amber-100 flex items-center justify-center text-amber-600 shrink-0">
                <span className="font-black text-lg sm:text-xl">%</span>
              </div>
              <div className="flex-1">
                <p className="text-[9px] sm:text-[10px] font-black text-amber-600/60 uppercase tracking-widest">Profit Margin</p>
                <p className="text-lg sm:text-2xl font-black text-amber-700">{reportData.margin.toFixed(2)}%</p>
              </div>
            </div>
          </div>
        </section>

        {/* 2. Revenue Summary */}
        <section className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
              <span className="font-black text-sm">2</span>
            </div>
            <h5 className="text-lg font-bold text-slate-800">Revenue Summary</h5>
          </div>
          <div className="overflow-x-auto rounded-3xl border border-slate-100">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50">
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Category</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Project/Client</th>
                  {reportData.months.map(m => (
                    <th key={m} className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">
                      {new Date(m + '-01').toLocaleDateString('en-US', { month: 'short' })}
                    </th>
                  ))}
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {Object.entries(reportData.revenueByProject).map(([name, data]) => (
                  <tr key={name} className="hover:bg-slate-50/30 transition-colors">
                    <td className="px-6 py-4">
                      <span className={cn(
                        "px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest",
                        data.type === 'Recurring' ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-600"
                      )}>
                        {data.type} Projects
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm font-bold text-slate-800">{name}</td>
                    {reportData.months.map(m => (
                      <td key={m} className="px-6 py-4 text-sm font-bold text-emerald-600 text-right">
                        {data.monthly[m] ? formatCurrency(data.monthly[m]) : '-'}
                      </td>
                    ))}
                    <td className="px-6 py-4 text-sm font-black text-indigo-600 text-right">
                      {formatCurrency(data.total)}
                    </td>
                  </tr>
                ))}
                <tr className="bg-slate-900 text-white">
                  <td colSpan={2} className="px-6 py-4 text-sm font-black uppercase tracking-wider">Total Revenue</td>
                  {reportData.months.map(m => (
                    <td key={m} className="px-6 py-4 text-sm font-black text-right">
                      {formatCurrency(reportData.monthlySummary[m]?.revenue || 0)}
                    </td>
                  ))}
                  <td className="px-6 py-4 text-sm font-black text-right">
                    {formatCurrency(reportData.totalRevenue)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* 3. Operating Expenses */}
        <section className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
              <span className="font-black text-sm">3</span>
            </div>
            <h5 className="text-lg font-bold text-slate-800">Operating Expenses (OPEX)</h5>
          </div>
          <div className="overflow-x-auto rounded-3xl border border-slate-100">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50">
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Category</th>
                  {reportData.months.map(m => (
                    <th key={m} className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">
                      {new Date(m + '-01').toLocaleDateString('en-US', { month: 'short' })}
                    </th>
                  ))}
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {Object.entries(reportData.expensesByCategory).map(([cat, data]) => (
                  <tr key={cat} className="hover:bg-slate-50/30 transition-colors">
                    <td className="px-6 py-4 text-sm font-bold text-slate-800">{cat}</td>
                    {reportData.months.map(m => (
                      <td key={m} className="px-6 py-4 text-sm font-bold text-rose-500 text-right">
                        {data.monthly[m] ? formatCurrency(data.monthly[m]) : '-'}
                      </td>
                    ))}
                    <td className="px-6 py-4 text-sm font-black text-indigo-600 text-right">
                      {formatCurrency(data.total)}
                    </td>
                  </tr>
                ))}
                <tr className="bg-slate-900 text-white">
                  <td className="px-6 py-4 text-sm font-black uppercase tracking-wider">Total OPEX</td>
                  {reportData.months.map(m => (
                    <td key={m} className="px-6 py-4 text-sm font-black text-right">
                      {formatCurrency(reportData.monthlySummary[m]?.expense || 0)}
                    </td>
                  ))}
                  <td className="px-6 py-4 text-sm font-black text-right">
                    {formatCurrency(reportData.totalExpenses)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* 4. Net Profit / Loss */}
        <section className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
              <span className="font-black text-sm">4</span>
            </div>
            <h5 className="text-lg font-bold text-slate-800">Net Profit / Loss</h5>
          </div>
          <div className="overflow-x-auto rounded-3xl border border-slate-100">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50">
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Month</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Revenue</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Expense</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Net Amount</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Margin (%)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {reportData.months.map(m => {
                  const revenue = reportData.monthlySummary[m]?.revenue || 0;
                  const expense = reportData.monthlySummary[m]?.expense || 0;
                  const net = revenue - expense;
                  return (
                    <tr key={m} className="hover:bg-slate-50/30 transition-colors">
                      <td className="px-6 py-4 text-sm font-bold text-slate-800">
                        {new Date(m + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                      </td>
                      <td className="px-6 py-4 text-sm font-bold text-right text-emerald-600">
                        {formatCurrency(revenue)}
                      </td>
                      <td className="px-6 py-4 text-sm font-bold text-right text-rose-500">
                        {formatCurrency(expense)}
                      </td>
                      <td className={cn("px-6 py-4 text-sm font-black text-right", net >= 0 ? "text-emerald-600" : "text-rose-600")}>
                        {formatCurrency(net)}
                      </td>
                      <td className="px-6 py-4 text-sm font-bold text-right text-indigo-600">
                        {reportData.monthlySummary[m]?.margin.toFixed(2)}%
                      </td>
                    </tr>
                  );
                })}
                <tr className="bg-slate-900 text-white">
                  <td className="px-6 py-4 text-sm font-black uppercase tracking-wider">Total</td>
                  <td className="px-6 py-4 text-sm font-black text-right text-emerald-400">
                    {formatCurrency(reportData.totalRevenue)}
                  </td>
                  <td className="px-6 py-4 text-sm font-black text-right text-rose-400">
                    {formatCurrency(reportData.totalExpenses)}
                  </td>
                  <td className={cn("px-6 py-4 text-sm font-black text-right", reportData.netProfit >= 0 ? "text-emerald-400" : "text-rose-400")}>
                    {formatCurrency(reportData.netProfit)}
                  </td>
                  <td className="px-6 py-4 text-sm font-black text-right text-indigo-300">
                    {(reportData.totalRevenue > 0 ? (reportData.netProfit / reportData.totalRevenue) * 100 : 0).toFixed(2)}%
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* 5. Revenue Analysis */}
        <section className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
              <span className="font-black text-sm">5</span>
            </div>
            <h5 className="text-lg font-bold text-slate-800">Revenue Analysis</h5>
          </div>
          
          <div className="space-y-12">
            <ServiceRevenue entries={filteredEntries} userRole={userRole} />
            <ClientRevenue entries={filteredEntries} userRole={userRole} />
            <CountryRevenue entries={filteredEntries} clients={clients} userRole={userRole} />
          </div>
        </section>
      </div>
    </div>
  );
}
