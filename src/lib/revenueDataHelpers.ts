import { LedgerEntry, Client } from '../types';

export interface RevenueAggregation {
  items: string[];
  monthKeys: string[];
  monthLabels: string[];
  dataMap: Record<string, Record<string, number>>;
  rowTotals: Record<string, number>;
  colTotals: Record<string, number>;
  grandTotal: number;
}

const getRevenueEntries = (entries: LedgerEntry[]) => {
  return entries.filter(e => {
    let hasRevenue = false;
    (e.customEntries || []).forEach(ce => {
      if (ce.accountCategory === 'Equity') {
        const lowerName = ce.accountName.toLowerCase();
        const isCapital = lowerName.includes('capital') || lowerName.includes('partner') || lowerName.includes('owner') || lowerName.includes('drawing');
        
        const isRevKeywords = lowerName.includes('revenue') || lowerName.includes('income') || lowerName.includes('sales') || 
                            lowerName.includes('fees') || lowerName.includes('service') || lowerName.includes('billing') ||
                            lowerName.includes('retainer') || lowerName.includes('commission');
        
        if (isRevKeywords || (!isCapital && ce.type === 'Cr')) {
          hasRevenue = true;
        }
      }
    });
    
    const details = (e.details || '').toLowerCase();
    const itemName = (e.transactionItemName || '').toLowerCase();
    const remarks = (e.remarks || '').toLowerCase();
    const notes = (e.notes || '').toLowerCase();
    
    const isProjectRelated = 
      details.includes('project') || 
      itemName.includes('project') || 
      remarks.includes('tt-lg') ||
      notes.includes('tt-lg') ||
      remarks.includes('project') ||
      ((details.includes('revenue') || itemName.includes('revenue') || details.includes('income') || details.includes('sales')) && remarks.length > 0);
    
    return hasRevenue && isProjectRelated;
  });
};

export const getServiceRevenueData = (entries: LedgerEntry[]): RevenueAggregation => {
  const revenueEntries = getRevenueEntries(entries);
  const itemsList = new Set<string>();
  const months = new Set<string>();
  const dataMap: Record<string, Record<string, number>> = {};

  revenueEntries.forEach(entry => {
    const date = new Date(entry.date);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const projectName = entry.remarks || entry.transactionItemName || 'General-Uncategorized';
    
    let serviceName = 'Uncategorized';
    if (projectName.includes(')-')) {
      const parts = projectName.split(')-');
      serviceName = parts[parts.length - 1].trim();
    } else {
      const parts = projectName.split('-');
      serviceName = parts.length > 1 ? parts[parts.length - 1].trim() : projectName;
    }

    itemsList.add(serviceName);
    months.add(monthKey);
    if (!dataMap[serviceName]) dataMap[serviceName] = {};
    
    let entryRevenue = 0;
    (entry.customEntries || []).forEach(ce => {
      if (ce.accountCategory === 'Equity') {
        const lowerName = ce.accountName.toLowerCase();
        const isCapital = lowerName.includes('capital') || lowerName.includes('partner') || lowerName.includes('owner') || lowerName.includes('drawing');
        const isRevKeywords = lowerName.includes('revenue') || lowerName.includes('income') || lowerName.includes('sales') || 
                            lowerName.includes('fees') || lowerName.includes('service') || lowerName.includes('billing') ||
                            lowerName.includes('retainer') || lowerName.includes('commission');
        if (isRevKeywords || (!isCapital && ce.type === 'Cr')) {
          entryRevenue += ce.type === 'Cr' ? ce.amount : -ce.amount;
        }
      }
    });
    dataMap[serviceName][monthKey] = (dataMap[serviceName][monthKey] || 0) + entryRevenue;
  });

  const monthKeys = Array.from(months).sort((a, b) => a.localeCompare(b));
  const rowTotals: Record<string, number> = {};
  itemsList.forEach(item => {
    rowTotals[item] = monthKeys.reduce((sum, m) => sum + (dataMap[item][m] || 0), 0);
  });

  const sortedItems = Array.from(itemsList).sort((a, b) => rowTotals[b] - rowTotals[a]);
  const colTotals: Record<string, number> = {};
  let grandTotal = 0;
  monthKeys.forEach(m => {
    colTotals[m] = sortedItems.reduce((sum, item) => sum + (dataMap[item][m] || 0), 0);
    grandTotal += colTotals[m];
  });

  const monthLabels = monthKeys.map(key => {
    const [year, month] = key.split('-');
    return new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  });

  return { items: sortedItems, monthKeys, monthLabels, dataMap, rowTotals, colTotals, grandTotal };
};

export const getClientRevenueData = (entries: LedgerEntry[]): RevenueAggregation => {
  const revenueEntries = getRevenueEntries(entries);
  const itemsList = new Set<string>();
  const months = new Set<string>();
  const dataMap: Record<string, Record<string, number>> = {};

  revenueEntries.forEach(entry => {
    const date = new Date(entry.date);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const projectName = entry.remarks || entry.transactionItemName || 'General-Uncategorized';
    
    let clientId = 'Uncategorized';
    if (projectName.includes(')-')) {
      clientId = projectName.split(')-')[0].trim() + ')';
    } else {
      const parts = projectName.split('-');
      clientId = parts.length > 1 ? parts[0].trim() : projectName;
    }

    itemsList.add(clientId);
    months.add(monthKey);
    if (!dataMap[clientId]) dataMap[clientId] = {};
    
    let entryRevenue = 0;
    (entry.customEntries || []).forEach(ce => {
      if (ce.accountCategory === 'Equity') {
        const lowerName = ce.accountName.toLowerCase();
        const isCapital = lowerName.includes('capital') || lowerName.includes('partner') || lowerName.includes('owner') || lowerName.includes('drawing');
        const isRevKeywords = lowerName.includes('revenue') || lowerName.includes('income') || lowerName.includes('sales') || 
                            lowerName.includes('fees') || lowerName.includes('service') || lowerName.includes('billing') ||
                            lowerName.includes('retainer') || lowerName.includes('commission');
        if (isRevKeywords || (!isCapital && ce.type === 'Cr')) {
          entryRevenue += ce.type === 'Cr' ? ce.amount : -ce.amount;
        }
      }
    });
    dataMap[clientId][monthKey] = (dataMap[clientId][monthKey] || 0) + entryRevenue;
  });

  const monthKeys = Array.from(months).sort((a, b) => a.localeCompare(b));
  const rowTotals: Record<string, number> = {};
  itemsList.forEach(item => {
    rowTotals[item] = monthKeys.reduce((sum, m) => sum + (dataMap[item][m] || 0), 0);
  });

  const sortedItems = Array.from(itemsList).sort((a, b) => rowTotals[b] - rowTotals[a]);
  const colTotals: Record<string, number> = {};
  let grandTotal = 0;
  monthKeys.forEach(m => {
    colTotals[m] = sortedItems.reduce((sum, item) => sum + (dataMap[item][m] || 0), 0);
    grandTotal += colTotals[m];
  });

  const monthLabels = monthKeys.map(key => {
    const [year, month] = key.split('-');
    return new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  });

  return { items: sortedItems, monthKeys, monthLabels, dataMap, rowTotals, colTotals, grandTotal };
};

export const getCountryRevenueData = (entries: LedgerEntry[], clients: Client[]): RevenueAggregation => {
  const clientToCountryMap: Record<string, string> = {};
  clients.forEach(c => {
    if (c.projectName) {
      clientToCountryMap[c.projectName.toLowerCase().trim()] = c.country || 'Unknown';
    }
  });

  const revenueEntries = getRevenueEntries(entries);
  const itemsList = new Set<string>();
  const months = new Set<string>();
  const dataMap: Record<string, Record<string, number>> = {};

  revenueEntries.forEach(entry => {
    const date = new Date(entry.date);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const projectName = entry.remarks || entry.transactionItemName || 'General-Uncategorized';
    
    let clientId = 'Uncategorized';
    if (projectName.includes(')-')) {
      clientId = projectName.split(')-')[0].trim() + ')';
    } else {
      const parts = projectName.split('-');
      clientId = parts.length > 1 ? parts[0].trim() : projectName;
    }

    const country = clientToCountryMap[clientId.toLowerCase().trim()] || 'Others';

    itemsList.add(country);
    months.add(monthKey);
    if (!dataMap[country]) dataMap[country] = {};
    
    let entryRevenue = 0;
    (entry.customEntries || []).forEach(ce => {
      if (ce.accountCategory === 'Equity') {
        const lowerName = ce.accountName.toLowerCase();
        const isCapital = lowerName.includes('capital') || lowerName.includes('partner') || lowerName.includes('owner') || lowerName.includes('drawing');
        const isRevKeywords = lowerName.includes('revenue') || lowerName.includes('income') || lowerName.includes('sales') || 
                            lowerName.includes('fees') || lowerName.includes('service') || lowerName.includes('billing') ||
                            lowerName.includes('retainer') || lowerName.includes('commission');
        if (isRevKeywords || (!isCapital && ce.type === 'Cr')) {
          entryRevenue += ce.type === 'Cr' ? ce.amount : -ce.amount;
        }
      }
    });
    dataMap[country][monthKey] = (dataMap[country][monthKey] || 0) + entryRevenue;
  });

  const monthKeys = Array.from(months).sort((a, b) => a.localeCompare(b));
  const rowTotals: Record<string, number> = {};
  itemsList.forEach(item => {
    rowTotals[item] = monthKeys.reduce((sum, m) => sum + (dataMap[item][m] || 0), 0);
  });

  const sortedItems = Array.from(itemsList).sort((a, b) => rowTotals[b] - rowTotals[a]);
  const colTotals: Record<string, number> = {};
  let grandTotal = 0;
  monthKeys.forEach(m => {
    colTotals[m] = sortedItems.reduce((sum, item) => sum + (dataMap[item][m] || 0), 0);
    grandTotal += colTotals[m];
  });

  const monthLabels = monthKeys.map(key => {
    const [year, month] = key.split('-');
    return new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  });

  return { items: sortedItems, monthKeys, monthLabels, dataMap, rowTotals, colTotals, grandTotal };
};
