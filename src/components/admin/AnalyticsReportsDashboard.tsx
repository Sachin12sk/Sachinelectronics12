import React, { useState, useEffect, useMemo } from 'react';
import { onSnapshot } from 'firebase/firestore';
import { complaintsCollection, ordersCollection, techniciansCollection } from '../../lib/firebase';
import { Complaint, Order, Technician } from '../../types';
import {
  FileSpreadsheet,
  FileText,
  Search,
  Filter,
  Calendar,
  UserCheck,
  Wrench,
  ShoppingBag,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Printer,
  CheckCircle2,
  Clock,
  X,
  IndianRupee,
  Layers,
  Sparkles,
  MapPin,
  Phone,
  Eye,
  Hash,
  Download,
  ShieldCheck,
  Check
} from 'lucide-react';
import jsPDF from 'jspdf';

export interface UnifiedRecord {
  id: string;
  type: 'Repair Complaint' | 'Product Purchase';
  dateTime: string;
  isoDate: string;
  ticketOrOrderId: string;
  customerName: string;
  phone: string;
  address: string;
  pincode: string;
  serviceOrProductName: string;
  applianceCategory: string;
  problemDetails: string;
  serialNumber: string;
  technicianName: string;
  technicianId?: string;
  status: string;
  amount: number;
  paymentMode: string;
  rawComplaint?: Complaint;
  rawOrder?: Order;
}

export default function AnalyticsReportsDashboard() {
  // Raw Data States from Firebase RTDB
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  // Filter States
  const [selectedMonthYear, setSelectedMonthYear] = useState<string>('all');
  const [viewTab, setViewTab] = useState<'all' | 'orders' | 'repairs'>('all');
  const [selectedAppliance, setSelectedAppliance] = useState<string>('all');
  const [selectedTechnician, setSelectedTechnician] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Sorting & Pagination
  const [sortField, setSortField] = useState<keyof UnifiedRecord>('isoDate');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [rowsPerPage, setRowsPerPage] = useState<number>(20);

  // Export State Feedback
  const [isExportingCsv, setIsExportingCsv] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [exportSuccessMsg, setExportSuccessMsg] = useState<string | null>(null);

  // Selected Record Modal Details
  const [viewingRecord, setViewingRecord] = useState<UnifiedRecord | null>(null);

  // Real-time Cloud Firestore Listeners
  useEffect(() => {
    setLoading(true);

    // 1. Complaints Listener (Repairs across all appliances)
    const unsubComplaints = onSnapshot(
      complaintsCollection,
      (snapshot) => {
        if (!snapshot.empty) {
          const list: Complaint[] = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data()
          })) as Complaint[];
          setComplaints(list);
        } else {
          setComplaints([]);
        }
        setLastRefreshed(new Date());
      },
      (err) => {
        console.warn('Firestore complaints sync note in AnalyticsReportsDashboard:', err);
      }
    );

    // 2. Orders Listener (Product purchases & spare parts)
    const unsubOrders = onSnapshot(
      ordersCollection,
      (snapshot) => {
        if (!snapshot.empty) {
          const list: Order[] = snapshot.docs.map((doc) => ({
            id: doc.id,
            orderId: doc.data().orderId || doc.id,
            ...doc.data()
          })) as Order[];
          setOrders(list);
        } else {
          setOrders([]);
        }
        setLastRefreshed(new Date());
      },
      (err) => {
        console.warn('Firestore orders sync note in AnalyticsReportsDashboard:', err);
      }
    );

    // 3. Technicians Listener
    const unsubTech = onSnapshot(
      techniciansCollection,
      (snapshot) => {
        if (!snapshot.empty) {
          const list: Technician[] = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data()
          })) as Technician[];
          setTechnicians(list);
        } else {
          setTechnicians([]);
        }
        setLastRefreshed(new Date());
        setLoading(false);
      },
      (err) => {
        console.warn('Firestore technicians sync note in AnalyticsReportsDashboard:', err);
        setLoading(false);
      }
    );

    return () => {
      unsubComplaints();
      unsubOrders();
      unsubTech();
    };
  }, []);

  // Technician Quick Map for lookups
  const techMap = useMemo(() => {
    const map = new Map<string, string>();
    technicians.forEach((t) => {
      if (t.id) map.set(t.id, t.name || 'Technician');
    });
    return map;
  }, [technicians]);

  // Combine Complaints & Orders into unified records list with all required fields
  const allUnifiedRecords = useMemo<UnifiedRecord[]>(() => {
    const records: UnifiedRecord[] = [];

    // Helper: format dates
    const parseDateInfo = (rawDate: any) => {
      let d = new Date();
      if (rawDate) {
        const parsed = new Date(rawDate);
        if (!isNaN(parsed.getTime())) {
          d = parsed;
        }
      }
      const iso = d.toISOString();
      const formatted = d.toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
      return { iso, formatted, dateObj: d };
    };

    // 1. Process Complaints (Repairs: AC, Cooler, Motors, Washing Machine, Fans, etc.)
    complaints.forEach((c) => {
      const { iso, formatted } = parseDateInfo(c.createdAt);

      // Determine Ticket ID
      let ticketId = c.jobCardId || c.id || 'CMP-NA';
      if (!ticketId.startsWith('CMP-') && !ticketId.startsWith('#')) {
        ticketId = `CMP-${ticketId.substring(0, 8).toUpperCase()}`;
      }

      // Determine Technician Name
      let assignedTech = 'Unassigned';
      if (c.assignedTechnicianName && c.assignedTechnicianName.trim()) {
        assignedTech = c.assignedTechnicianName.trim();
      } else if (c.assignedTechnicianId && techMap.has(c.assignedTechnicianId)) {
        assignedTech = techMap.get(c.assignedTechnicianId)!;
      }

      // Determine Serial Number
      const serialNo =
        c.resolutionDetails?.serialNumber ||
        (c as any).serialNumber ||
        (c as any).serialNo ||
        (c as any).deviceSerial ||
        'N/A';

      // Amount
      const amt = Number(
        c.resolutionDetails?.totalCost ||
          (c as any).estimatedCost ||
          (c as any).totalCost ||
          0
      );

      // Appliance Category & Problem
      const applianceCat = c.product || c.appliance || c.device || 'Electrical Appliance';
      const prob = c.issue || (c as any).problem || (c as any).description || 'Repair Inspection';

      records.push({
        id: `repair_${c.id || Math.random()}`,
        type: 'Repair Complaint',
        dateTime: formatted,
        isoDate: iso,
        ticketOrOrderId: ticketId,
        customerName: c.name || (c as any).customerName || 'Customer',
        phone: c.phone || c.mobile || 'N/A',
        address: c.address || 'N/A',
        pincode: c.pincode || 'N/A',
        serviceOrProductName: applianceCat,
        applianceCategory: applianceCat,
        problemDetails: prob,
        serialNumber: serialNo,
        technicianName: assignedTech,
        technicianId: c.assignedTechnicianId,
        status: c.status || 'Pending',
        amount: amt,
        paymentMode: c.resolutionDetails?.paymentMethod || 'Cash / Offline',
        rawComplaint: c
      });
    });

    // 2. Process Orders (Purchases & Spare Parts)
    orders.forEach((o) => {
      const { iso, formatted } = parseDateInfo(o.createdAt);

      // Determine Order ID
      let orderId = o.orderId || o.id || 'ORD-NA';
      if (!orderId.startsWith('#')) {
        orderId = `#${orderId}`;
      }

      // Determine Serial Number
      const serialNo =
        (o as any).serialNumber ||
        (o as any).serialNo ||
        (o as any).imei ||
        o.orderId ||
        'N/A';

      // Determine Technician / Assigned Staff
      const assignedStaff =
        (o as any).assignedTechnicianName ||
        (o as any).technicianName ||
        'Store Dispatch';

      // Determine Amount
      const amt = Number(o.totalPrice || o.price || (o as any).finalPrice || 0);

      records.push({
        id: `order_${o.id || Math.random()}`,
        type: 'Product Purchase',
        dateTime: formatted,
        isoDate: iso,
        ticketOrOrderId: orderId,
        customerName: o.customerName || 'Customer',
        phone: o.customerPhone || 'N/A',
        address: o.customerAddress || 'N/A',
        pincode: o.pincode || 'N/A',
        serviceOrProductName: o.productName || 'Electrical Product / Part',
        applianceCategory: o.productCategory || 'Appliance / Spare',
        problemDetails: `Qty: ${o.quantity || 1} • Item Purchase`,
        serialNumber: serialNo,
        technicianName: assignedStaff,
        technicianId: (o as any).assignedTechnicianId,
        status: o.status || 'Order Placed',
        amount: amt,
        paymentMode: o.paymentMethod ? o.paymentMethod.toUpperCase() : 'COD',
        rawOrder: o
      });
    });

    return records;
  }, [complaints, orders, techMap]);

  // Extract all available months (YYYY-MM) from data & generate nice dropdown options
  const monthOptions = useMemo(() => {
    const monthSet = new Set<string>();

    allUnifiedRecords.forEach((r) => {
      if (r.isoDate) {
        const ym = r.isoDate.substring(0, 7);
        monthSet.add(ym);
      }
    });

    const now = new Date();
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthSet.add(ym);
    }

    const sorted = Array.from(monthSet).sort().reverse();

    return sorted.map((ym) => {
      const [yearStr, monthStr] = ym.split('-');
      const d = new Date(parseInt(yearStr, 10), parseInt(monthStr, 10) - 1, 1);
      const label = d.toLocaleString('en-IN', { month: 'long', year: 'numeric' });
      return { value: ym, label };
    });
  }, [allUnifiedRecords]);

  // Unique appliance categories from complaints
  const applianceCategories = useMemo(() => {
    const set = new Set<string>();
    complaints.forEach((c) => {
      const cat = c.product || c.appliance || c.device;
      if (cat) set.add(cat.trim());
    });
    return Array.from(set).sort();
  }, [complaints]);

  // Unique technicians
  const technicianList = useMemo(() => {
    const list = technicians.map((t) => ({ id: t.id || t.name, name: t.name }));
    complaints.forEach((c) => {
      if (
        c.assignedTechnicianName &&
        !list.some(
          (item) =>
            item.name.toLowerCase() === c.assignedTechnicianName!.toLowerCase()
        )
      ) {
        list.push({
          id: c.assignedTechnicianId || c.assignedTechnicianName,
          name: c.assignedTechnicianName
        });
      }
    });
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [technicians, complaints]);

  // FILTERING LOGIC
  const filteredRecords = useMemo(() => {
    return allUnifiedRecords.filter((rec) => {
      // 1. Month/Year filter
      if (selectedMonthYear !== 'all') {
        if (!rec.isoDate.startsWith(selectedMonthYear)) {
          return false;
        }
      }

      // 2. Tab Filter (All / Orders / Repairs)
      if (viewTab === 'orders' && rec.type !== 'Product Purchase') {
        return false;
      }
      if (viewTab === 'repairs' && rec.type !== 'Repair Complaint') {
        return false;
      }

      // 3. Appliance sub-filter
      if (selectedAppliance !== 'all') {
        if (
          !rec.applianceCategory ||
          rec.applianceCategory.toLowerCase() !== selectedAppliance.toLowerCase()
        ) {
          return false;
        }
      }

      // 4. Technician Filter
      if (selectedTechnician !== 'all') {
        if (selectedTechnician === 'unassigned') {
          if (rec.technicianName.toLowerCase() !== 'unassigned') return false;
        } else {
          const matchId = rec.technicianId === selectedTechnician;
          const matchName =
            rec.technicianName.toLowerCase() === selectedTechnician.toLowerCase();
          if (!matchId && !matchName) return false;
        }
      }

      // 5. Status Filter
      if (selectedStatus !== 'all') {
        const s = rec.status.toLowerCase();
        if (selectedStatus === 'completed') {
          if (
            !s.includes('completed') &&
            !s.includes('resolved') &&
            !s.includes('delivered')
          ) {
            return false;
          }
        } else if (selectedStatus === 'pending') {
          if (
            s.includes('completed') ||
            s.includes('resolved') ||
            s.includes('delivered') ||
            s.includes('cancelled')
          ) {
            return false;
          }
        } else if (selectedStatus === 'cancelled') {
          if (!s.includes('cancelled') && !s.includes('reject')) {
            return false;
          }
        }
      }

      // 6. Universal Search Bar
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = rec.customerName.toLowerCase().includes(q);
        const matchPhone = rec.phone.toLowerCase().includes(q);
        const matchId = rec.ticketOrOrderId.toLowerCase().includes(q);
        const matchSerial = rec.serialNumber.toLowerCase().includes(q);
        const matchPincode = rec.pincode.toLowerCase().includes(q);
        const matchItem = rec.serviceOrProductName.toLowerCase().includes(q);
        const matchProblem = rec.problemDetails.toLowerCase().includes(q);
        const matchTech = rec.technicianName.toLowerCase().includes(q);
        const matchAddr = rec.address.toLowerCase().includes(q);
        const matchStatus = rec.status.toLowerCase().includes(q);

        if (
          !matchName &&
          !matchPhone &&
          !matchId &&
          !matchSerial &&
          !matchPincode &&
          !matchItem &&
          !matchProblem &&
          !matchTech &&
          !matchAddr &&
          !matchStatus
        ) {
          return false;
        }
      }

      return true;
    });
  }, [
    allUnifiedRecords,
    selectedMonthYear,
    viewTab,
    selectedAppliance,
    selectedTechnician,
    selectedStatus,
    searchQuery
  ]);

  // SORTING LOGIC
  const sortedRecords = useMemo(() => {
    return [...filteredRecords].sort((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];

      if (typeof aVal === 'string') aVal = (aVal as string).toLowerCase();
      if (typeof bVal === 'string') bVal = (bVal as string).toLowerCase();

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredRecords, sortField, sortDirection]);

  // PAGINATION LOGIC
  const totalPages = Math.ceil(sortedRecords.length / rowsPerPage) || 1;
  const paginatedRecords = useMemo(() => {
    const startIndex = (currentPage - 1) * rowsPerPage;
    return sortedRecords.slice(startIndex, startIndex + rowsPerPage);
  }, [sortedRecords, currentPage, rowsPerPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [
    selectedMonthYear,
    viewTab,
    selectedAppliance,
    selectedTechnician,
    selectedStatus,
    searchQuery,
    rowsPerPage
  ]);

  // AGGREGATED METRICS
  const stats = useMemo(() => {
    const totalTransactions = filteredRecords.length;
    let totalRevenue = 0;
    let repairCount = 0;
    let purchaseCount = 0;
    let completedCount = 0;

    filteredRecords.forEach((r) => {
      totalRevenue += r.amount;
      if (r.type === 'Repair Complaint') repairCount++;
      if (r.type === 'Product Purchase') purchaseCount++;

      const s = r.status.toLowerCase();
      if (
        s.includes('completed') ||
        s.includes('resolved') ||
        s.includes('delivered')
      ) {
        completedCount++;
      }
    });

    return {
      totalTransactions,
      totalRevenue,
      repairCount,
      purchaseCount,
      completedCount
    };
  }, [filteredRecords]);

  // Handle Sort
  const handleSort = (field: keyof UnifiedRecord) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  // EXCEL / CSV EXPORTER
  const handleExportCsv = () => {
    setIsExportingCsv(true);
    try {
      const headers = [
        'Date & Time',
        'Record Type',
        'Ticket / Order ID',
        'Customer Name',
        'Phone',
        'Delivery Address',
        'Pincode',
        'Item / Appliance',
        'Problem Details',
        'Serial No',
        'Technician',
        'Status',
        'Amount (₹)'
      ];

      const csvRows: string[] = [];
      csvRows.push(headers.map((h) => `"${h.replace(/"/g, '""')}"`).join(','));

      sortedRecords.forEach((r) => {
        const rowData = [
          r.dateTime,
          r.type,
          r.ticketOrOrderId,
          r.customerName,
          r.phone,
          r.address,
          r.pincode,
          r.serviceOrProductName,
          r.problemDetails,
          r.serialNumber,
          r.technicianName,
          r.status,
          r.amount.toFixed(2)
        ];
        csvRows.push(
          rowData.map((val) => `"${String(val || '').replace(/"/g, '""')}"`).join(',')
        );
      });

      const csvContent = '\uFEFF' + csvRows.join('\r\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);

      const monthLabel =
        selectedMonthYear === 'all' ? 'All_Time' : selectedMonthYear;
      const filename = `Sachin_Electronic_Master_Data_${monthLabel}_${new Date()
        .toISOString()
        .substring(0, 10)}.csv`;

      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setExportSuccessMsg(
        `Successfully exported ${sortedRecords.length} records to Excel (.CSV)!`
      );
      setTimeout(() => setExportSuccessMsg(null), 4000);
    } catch (err) {
      console.error('CSV Export Error:', err);
      alert('Failed to generate Excel (.CSV) sheet. Please try again.');
    } finally {
      setIsExportingCsv(false);
    }
  };

  /**
   * ONE-CLICK MASTER PDF GENERATOR
   * Produces a clean, multi-page formatted PDF containing:
   * - Header: Shop Name (Sachin Electronic), Date of Export, Total Orders/Complaints Summary
   * - Section 1: Complete Product Purchases & Order Records (Order ID, Customer Name, Phone, Item, Serial No, Amount, Status)
   * - Section 2: Complete Repair Service Complaints (Ticket ID, Appliance Type, Problem Details, Assigned Technician, Status)
   * Supports targetMonth: 'all' (all-time) or specific 'YYYY-MM'
   */
  const handleDownloadMasterPdf = (targetMonth?: string) => {
    setIsExportingPdf(true);
    try {
      const monthToExport = targetMonth || selectedMonthYear;

      // Filter dataset based on requested month
      const dataset =
        monthToExport === 'all'
          ? allUnifiedRecords
          : allUnifiedRecords.filter((r) => r.isoDate.startsWith(monthToExport));

      // Separate into Section 1 (Orders) & Section 2 (Complaints)
      const orderRecords = dataset.filter((r) => r.type === 'Product Purchase');
      const complaintRecords = dataset.filter((r) => r.type === 'Repair Complaint');

      const totalOrderAmount = orderRecords.reduce((acc, r) => acc + r.amount, 0);
      const totalComplaintAmount = complaintRecords.reduce((acc, r) => acc + r.amount, 0);
      const combinedAmount = totalOrderAmount + totalComplaintAmount;

      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const marginX = 10;
      const printableWidth = pageWidth - marginX * 2;

      // Scope Label
      let scopeLabel = 'All-Time Lifetime Database';
      if (monthToExport !== 'all') {
        const found = monthOptions.find((m) => m.value === monthToExport);
        scopeLabel = found ? found.label : monthToExport;
      }

      // Helper: print the Master Header
      const printMasterHeader = (y: number, isFirstPage: boolean) => {
        // Top navy banner
        doc.setFillColor(15, 23, 42); // Slate 900
        doc.rect(0, 0, pageWidth, isFirstPage ? 24 : 12, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(isFirstPage ? 16 : 10);
        doc.setTextColor(255, 255, 255);
        doc.text('SACHIN ELECTRONIC', 14, isFirstPage ? 10 : 8);

        if (isFirstPage) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(9.5);
          doc.setTextColor(203, 213, 225); // Slate 300
          doc.text(
            'Centralized Master Audit & Transaction Report • Product Orders, Repair Complaints & Serial Numbers',
            14,
            16
          );

          doc.setFontSize(8.5);
          doc.setTextColor(248, 250, 252);
          doc.text(
            `Date of Export: ${new Date().toLocaleString('en-IN')}`,
            pageWidth - 14,
            10,
            { align: 'right' }
          );
          doc.text(
            `Report Scope: ${scopeLabel}`,
            pageWidth - 14,
            16,
            { align: 'right' }
          );

          // Sub-bar KPI summary
          doc.setFillColor(241, 245, 249); // Slate 100
          doc.rect(0, 24, pageWidth, 12, 'F');

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8.5);
          doc.setTextColor(30, 41, 59);
          doc.text(
            `TOTAL ORDERS: ${orderRecords.length} (Rs. ${totalOrderAmount.toLocaleString(
              'en-IN'
            )})   |   TOTAL COMPLAINTS: ${complaintRecords.length} (Rs. ${totalComplaintAmount.toLocaleString(
              'en-IN'
            )})   |   COMBINED REVENUE: Rs. ${combinedAmount.toLocaleString(
              'en-IN'
            )}`,
            14,
            31.5
          );

          return 40;
        } else {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8.5);
          doc.setTextColor(203, 213, 225);
          doc.text(
            `Master Report (${scopeLabel})`,
            pageWidth - 14,
            8,
            { align: 'right' }
          );
          return 16;
        }
      };

      // Truncate helper
      const trunc = (txt: string, maxLen: number) => {
        if (!txt) return 'N/A';
        return txt.length > maxLen ? txt.substring(0, maxLen) + '..' : txt;
      };

      let currentY = printMasterHeader(0, true);

      // SECTION 1: COMPLETE PRODUCT PURCHASES & ORDER RECORDS
      // Columns: Order ID | Customer Name | Phone | Item | Serial No | Amount | Status
      const section1Widths = [32, 45, 30, 65, 40, 30, 35]; // Sum: 277 mm
      const section1Headers = [
        'Order ID',
        'Customer Name',
        'Phone',
        'Item / Product',
        'Serial No',
        'Amount (₹)',
        'Status'
      ];

      // Print Section 1 Title Banner
      doc.setFillColor(30, 58, 138); // Deep Blue
      doc.rect(marginX, currentY, printableWidth, 8, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(255, 255, 255);
      doc.text(
        `SECTION 1: COMPLETE PRODUCT PURCHASES & ORDER RECORDS (${orderRecords.length} Items - Rs. ${totalOrderAmount.toLocaleString(
          'en-IN'
        )})`,
        marginX + 3,
        currentY + 5.5
      );
      currentY += 8;

      // Print Section 1 Table Header
      const printSec1TableHeader = (y: number) => {
        doc.setFillColor(226, 232, 240);
        doc.rect(marginX, y, printableWidth, 7, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(15, 23, 42);

        let currX = marginX;
        section1Headers.forEach((h, idx) => {
          doc.text(h, currX + 2, y + 4.8);
          currX += section1Widths[idx];
        });
        return y + 7.5;
      };

      currentY = printSec1TableHeader(currentY);

      if (orderRecords.length === 0) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.text('No product purchases or spare orders found for this period.', marginX + 4, currentY + 5);
        currentY += 8;
      } else {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);

        orderRecords.forEach((r, i) => {
          if (currentY + 6.5 > pageHeight - 16) {
            // Footer
            doc.setFontSize(8);
            doc.setTextColor(148, 163, 184);
            doc.text(
              `Sachin Electronic • Page ${doc.getNumberOfPages()}`,
              pageWidth / 2,
              pageHeight - 6,
              { align: 'center' }
            );

            doc.addPage();
            currentY = printMasterHeader(0, false);
            currentY = printSec1TableHeader(currentY);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7.5);
          }

          if (i % 2 === 1) {
            doc.setFillColor(248, 250, 252);
            doc.rect(marginX, currentY, printableWidth, 6.5, 'F');
          }

          doc.setTextColor(30, 41, 59);

          let currX = marginX;
          const vals = [
            trunc(r.ticketOrOrderId, 16),
            trunc(r.customerName, 24),
            trunc(r.phone, 14),
            trunc(r.serviceOrProductName, 34),
            trunc(r.serialNumber, 20),
            `Rs. ${r.amount.toLocaleString('en-IN')}`,
            trunc(r.status, 16)
          ];

          vals.forEach((v, idx) => {
            doc.text(v, currX + 2, currentY + 4.5);
            currX += section1Widths[idx];
          });

          doc.setDrawColor(241, 245, 249);
          doc.line(marginX, currentY + 6.5, pageWidth - marginX, currentY + 6.5);
          currentY += 6.5;
        });

        // Section 1 Subtotal Line
        doc.setFillColor(241, 245, 249);
        doc.rect(marginX, currentY, printableWidth, 6.5, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(15, 23, 42);
        doc.text(
          `Subtotal Orders: ${orderRecords.length} item(s)`,
          marginX + 2,
          currentY + 4.5
        );
        doc.text(
          `Total: Rs. ${totalOrderAmount.toLocaleString('en-IN')}`,
          marginX + section1Widths[0] + section1Widths[1] + section1Widths[2] + section1Widths[3] + section1Widths[4] + 2,
          currentY + 4.5
        );
        currentY += 10;
      }

      // Check if space for Section 2 or page break
      if (currentY + 25 > pageHeight - 16) {
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);
        doc.text(
          `Sachin Electronic • Page ${doc.getNumberOfPages()}`,
          pageWidth / 2,
          pageHeight - 6,
          { align: 'center' }
        );

        doc.addPage();
        currentY = printMasterHeader(0, false);
      }

      // SECTION 2: COMPLETE REPAIR SERVICE COMPLAINTS
      // Columns: Ticket ID | Appliance Type | Problem Details | Assigned Technician | Status (+ Customer & Amount)
      const section2Widths = [30, 35, 60, 42, 45, 35, 30]; // Sum: 277 mm
      const section2Headers = [
        'Ticket ID',
        'Appliance Type',
        'Problem Details',
        'Customer & Phone',
        'Assigned Technician',
        'Status',
        'Amount (₹)'
      ];

      // Print Section 2 Title Banner
      doc.setFillColor(180, 83, 9); // Amber 700
      doc.rect(marginX, currentY, printableWidth, 8, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(255, 255, 255);
      doc.text(
        `SECTION 2: COMPLETE REPAIR SERVICE COMPLAINTS (${complaintRecords.length} Tickets - Rs. ${totalComplaintAmount.toLocaleString(
          'en-IN'
        )})`,
        marginX + 3,
        currentY + 5.5
      );
      currentY += 8;

      // Print Section 2 Table Header
      const printSec2TableHeader = (y: number) => {
        doc.setFillColor(226, 232, 240);
        doc.rect(marginX, y, printableWidth, 7, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(15, 23, 42);

        let currX = marginX;
        section2Headers.forEach((h, idx) => {
          doc.text(h, currX + 2, y + 4.8);
          currX += section2Widths[idx];
        });
        return y + 7.5;
      };

      currentY = printSec2TableHeader(currentY);

      if (complaintRecords.length === 0) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.text('No repair complaints found for this period.', marginX + 4, currentY + 5);
        currentY += 8;
      } else {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);

        complaintRecords.forEach((r, i) => {
          if (currentY + 6.5 > pageHeight - 16) {
            doc.setFontSize(8);
            doc.setTextColor(148, 163, 184);
            doc.text(
              `Sachin Electronic • Page ${doc.getNumberOfPages()}`,
              pageWidth / 2,
              pageHeight - 6,
              { align: 'center' }
            );

            doc.addPage();
            currentY = printMasterHeader(0, false);
            currentY = printSec2TableHeader(currentY);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7.5);
          }

          if (i % 2 === 1) {
            doc.setFillColor(248, 250, 252);
            doc.rect(marginX, currentY, printableWidth, 6.5, 'F');
          }

          doc.setTextColor(30, 41, 59);

          let currX = marginX;
          const vals = [
            trunc(r.ticketOrOrderId, 15),
            trunc(r.applianceCategory, 18),
            trunc(r.problemDetails, 32),
            trunc(`${r.customerName} (${r.phone})`, 22),
            trunc(r.technicianName, 22),
            trunc(r.status, 16),
            `Rs. ${r.amount.toLocaleString('en-IN')}`
          ];

          vals.forEach((v, idx) => {
            doc.text(v, currX + 2, currentY + 4.5);
            currX += section2Widths[idx];
          });

          doc.setDrawColor(241, 245, 249);
          doc.line(marginX, currentY + 6.5, pageWidth - marginX, currentY + 6.5);
          currentY += 6.5;
        });

        // Section 2 Subtotal Line
        doc.setFillColor(241, 245, 249);
        doc.rect(marginX, currentY, printableWidth, 6.5, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(15, 23, 42);
        doc.text(
          `Subtotal Complaints: ${complaintRecords.length} ticket(s)`,
          marginX + 2,
          currentY + 4.5
        );
        doc.text(
          `Total: Rs. ${totalComplaintAmount.toLocaleString('en-IN')}`,
          marginX + section2Widths[0] + section2Widths[1] + section2Widths[2] + section2Widths[3] + section2Widths[4] + section2Widths[5] + 2,
          currentY + 4.5
        );
        currentY += 10;
      }

      // Final Master Page Footer
      const totalPagesCount = doc.getNumberOfPages();
      for (let p = 1; p <= totalPagesCount; p++) {
        doc.setPage(p);
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);
        doc.text(
          `Sachin Electronic • Centralized Master Records System • Page ${p} of ${totalPagesCount}`,
          pageWidth / 2,
          pageHeight - 6,
          { align: 'center' }
        );
      }

      const cleanMonthTag = monthToExport === 'all' ? 'All_Time' : monthToExport;
      const pdfFilename = `Sachin_Electronic_Master_Report_${cleanMonthTag}_${new Date()
        .toISOString()
        .substring(0, 10)}.pdf`;

      doc.save(pdfFilename);

      setExportSuccessMsg(
        `Successfully downloaded Master PDF Report (${dataset.length} records, ${scopeLabel})!`
      );
      setTimeout(() => setExportSuccessMsg(null), 5000);
    } catch (err) {
      console.error('Master PDF Generation Error:', err);
      alert('Failed to generate Master PDF report. Please try again.');
    } finally {
      setIsExportingPdf(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Header */}
      <div className="bg-slate-900 text-white rounded-3xl shadow-xl border border-slate-800 p-6 sm:p-8 relative overflow-hidden">
        {/* Subtle decorative background gradient */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-emerald-600/10 rounded-full blur-3xl pointer-events-none -ml-20 -mb-20"></div>

        <div className="relative z-10 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-6">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-600/40">
                <Layers className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
                    📁 Master Data & PDF Export
                  </h1>
                  <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                    Live Firebase Sync
                  </span>
                </div>
                <p className="text-sm text-slate-400 mt-1">
                  Centralized All-in-One Data Storage & One-Click Master Audit Reports for <b>Sachin Electronic</b>.
                </p>
              </div>
            </div>
          </div>

          {/* PROMINENT ONE-CLICK MASTER PDF DOWNLOAD & ACTION BUTTONS */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Prominent High-Contrast Master PDF Button */}
            <button
              type="button"
              onClick={() => handleDownloadMasterPdf()}
              disabled={isExportingPdf || sortedRecords.length === 0}
              className="inline-flex items-center gap-2.5 px-5 py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-extrabold text-sm sm:text-base rounded-2xl shadow-xl shadow-emerald-900/40 hover:shadow-emerald-600/30 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer border border-emerald-400/30"
              title="Download Master PDF with Section 1 (Product Purchases) & Section 2 (Repair Complaints)"
            >
              <FileText className="w-5 h-5 text-emerald-100" />
              <span>{isExportingPdf ? 'Generating Master PDF...' : '📄 Download Complete Master Report (PDF)'}</span>
            </button>

            {/* Excel Sheet Exporter */}
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={isExportingCsv || sortedRecords.length === 0}
              className="inline-flex items-center gap-2 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-100 font-bold text-sm rounded-2xl border border-slate-700 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              <span>{isExportingCsv ? 'Exporting...' : '📥 Download Excel Sheet'}</span>
            </button>

            {/* Print View */}
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 px-3.5 py-3 bg-slate-800/80 hover:bg-slate-700 text-slate-300 font-semibold text-sm rounded-2xl border border-slate-700/80 transition-all"
              title="Print View"
            >
              <Printer className="w-4 h-4" />
              <span className="hidden sm:inline">Print</span>
            </button>
          </div>
        </div>

        {/* Success toast notification */}
        {exportSuccessMsg && (
          <div className="mt-5 p-3.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm font-semibold rounded-2xl flex items-center gap-2.5 animate-fadeIn">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <span>{exportSuccessMsg}</span>
          </div>
        )}

        {/* Summary Metrics Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-4 backdrop-blur-sm">
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span className="text-xs font-bold uppercase tracking-wider">Total Transactions</span>
              <Layers className="w-4 h-4 text-blue-400" />
            </div>
            <div className="text-2xl font-black text-white tracking-tight">
              {stats.totalTransactions.toLocaleString('en-IN')}
            </div>
            <div className="text-[11px] text-slate-400 mt-1 flex gap-2">
              <span>{stats.repairCount} Repairs</span>
              <span>•</span>
              <span>{stats.purchaseCount} Purchases</span>
            </div>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-4 backdrop-blur-sm">
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span className="text-xs font-bold uppercase tracking-wider">Total Volume / Revenue</span>
              <IndianRupee className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-black text-emerald-400 tracking-tight">
              ₹{stats.totalRevenue.toLocaleString('en-IN')}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              All repairs, sales & spare parts
            </div>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-4 backdrop-blur-sm">
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span className="text-xs font-bold uppercase tracking-wider">Repair Complaints</span>
              <Wrench className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-2xl font-black text-white tracking-tight">
              {stats.repairCount.toLocaleString('en-IN')}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              AC, Cooler, Motor, Wash Machine, etc.
            </div>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-4 backdrop-blur-sm">
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span className="text-xs font-bold uppercase tracking-wider">Product Purchases</span>
              <ShoppingBag className="w-4 h-4 text-purple-400" />
            </div>
            <div className="text-2xl font-black text-purple-300 tracking-tight">
              {stats.purchaseCount.toLocaleString('en-IN')}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              Direct store & customer bookings
            </div>
          </div>
        </div>
      </div>

      {/* FILTER CONTROLS & SCOPE SELECTOR */}
      <div className="bg-white rounded-3xl shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-slate-200 p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          {/* View Tab Selector: All Records / Product Purchases / Repair Complaints */}
          <div className="inline-flex p-1 bg-slate-100 rounded-2xl">
            <button
              type="button"
              onClick={() => setViewTab('all')}
              className={`px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                viewTab === 'all'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Records ({allUnifiedRecords.length})
            </button>
            <button
              type="button"
              onClick={() => setViewTab('orders')}
              className={`px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
                viewTab === 'orders'
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>Purchases & Orders ({orders.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setViewTab('repairs')}
              className={`px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
                viewTab === 'repairs'
                  ? 'bg-white text-amber-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Wrench className="w-3.5 h-3.5" />
              <span>Repair Complaints ({complaints.length})</span>
            </button>
          </div>

          {/* Quick PDF Scope Buttons */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleDownloadMasterPdf('all')}
              disabled={isExportingPdf}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors cursor-pointer"
            >
              🌐 Export All-Time PDF
            </button>
            {monthOptions.length > 0 && (
              <button
                type="button"
                onClick={() => handleDownloadMasterPdf(monthOptions[0].value)}
                disabled={isExportingPdf}
                className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs rounded-xl transition-colors cursor-pointer"
              >
                📅 Export Current Month PDF
              </button>
            )}
          </div>
        </div>

        {/* Filter Inputs Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-2 border-t border-slate-100">
          {/* 1. Month / Year Selector */}
          <div>
            <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
              Filter Month & Year
            </label>
            <div className="relative">
              <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <select
                value={selectedMonthYear}
                onChange={(e) => setSelectedMonthYear(e.target.value)}
                className="w-full pl-9 pr-8 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white focus:border-blue-500 focus:outline-none transition-colors appearance-none cursor-pointer"
              >
                <option value="all">📅 All-Time Data (Lifetime)</option>
                {monthOptions.map((opt, idx) => (
                  <option key={opt.value} value={opt.value}>
                    {idx === 0 ? `⭐ Current Month (${opt.label})` : opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 2. Appliance Filter */}
          <div>
            <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
              Appliance / Category
            </label>
            <select
              value={selectedAppliance}
              onChange={(e) => setSelectedAppliance(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white focus:border-blue-500 focus:outline-none transition-colors cursor-pointer"
            >
              <option value="all">All Appliances & Products</option>
              {applianceCategories.map((cat) => (
                <option key={cat} value={cat}>
                  🔧 {cat}
                </option>
              ))}
            </select>
          </div>

          {/* 3. Technician Filter */}
          <div>
            <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
              Technician Assignment
            </label>
            <div className="relative">
              <UserCheck className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <select
                value={selectedTechnician}
                onChange={(e) => setSelectedTechnician(e.target.value)}
                className="w-full pl-9 pr-8 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white focus:border-blue-500 focus:outline-none transition-colors appearance-none cursor-pointer"
              >
                <option value="all">All Technicians</option>
                <option value="unassigned">⚠️ Unassigned Jobs</option>
                {technicianList.map((t) => (
                  <option key={t.id} value={t.id}>
                    👨‍🔧 {t.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 4. Status Filter */}
          <div>
            <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
              Status
            </label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white focus:border-blue-500 focus:outline-none transition-colors cursor-pointer"
            >
              <option value="all">All Statuses</option>
              <option value="completed">Completed / Delivered</option>
              <option value="pending">Pending / In Progress</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          {/* 5. Universal Search Bar */}
          <div>
            <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
              Universal Search
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Name, Phone, ID, Serial, Pin..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-8 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:bg-white focus:border-blue-500 focus:outline-none transition-colors placeholder:text-slate-400"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Reset button indicator if filtered */}
        {(selectedMonthYear !== 'all' ||
          viewTab !== 'all' ||
          selectedAppliance !== 'all' ||
          selectedTechnician !== 'all' ||
          selectedStatus !== 'all' ||
          searchQuery) && (
          <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
            <span>
              Active Filter: <b>{sortedRecords.length}</b> matches found out of {allUnifiedRecords.length} total
            </span>
            <button
              type="button"
              onClick={() => {
                setSelectedMonthYear('all');
                setViewTab('all');
                setSelectedAppliance('all');
                setSelectedTechnician('all');
                setSelectedStatus('all');
                setSearchQuery('');
              }}
              className="text-blue-600 hover:text-blue-800 font-bold underline cursor-pointer"
            >
              Reset All Filters
            </button>
          </div>
        )}
      </div>

      {/* CENTRALIZED ALL-DATA STORAGE TABLE */}
      <div className="bg-white rounded-3xl shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-slate-200 overflow-hidden">
        {/* Table Controls Header */}
        <div className="p-4 sm:p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="font-black text-slate-900 text-lg flex items-center gap-2">
              <span>All-in-One Master Transaction Store</span>
              <span className="text-xs font-bold px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full border border-blue-200">
                {sortedRecords.length} records
              </span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Live records showing Customer Details, Delivery Addresses, Pincodes, Order IDs, Serial Numbers & Technician Assignments.
            </p>
          </div>

          <div className="flex items-center gap-3 self-end sm:self-auto">
            <label className="text-xs font-semibold text-slate-500">Rows per page:</label>
            <select
              value={rowsPerPage}
              onChange={(e) => setRowsPerPage(Number(e.target.value))}
              className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 cursor-pointer"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>

        {/* Master Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50/90 border-b border-slate-200 text-slate-600 font-bold tracking-wider uppercase">
                <th
                  onClick={() => handleSort('isoDate')}
                  className="px-4 py-3.5 cursor-pointer hover:bg-slate-100 transition-colors"
                >
                  <div className="flex items-center gap-1">
                    <span>Date & Time</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('ticketOrOrderId')}
                  className="px-4 py-3.5 cursor-pointer hover:bg-slate-100 transition-colors"
                >
                  <div className="flex items-center gap-1">
                    <span>Ticket / Order ID</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('customerName')}
                  className="px-4 py-3.5 cursor-pointer hover:bg-slate-100 transition-colors"
                >
                  <div className="flex items-center gap-1">
                    <span>Customer Details</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th className="px-4 py-3.5">Address & Pincode</th>
                <th
                  onClick={() => handleSort('serviceOrProductName')}
                  className="px-4 py-3.5 cursor-pointer hover:bg-slate-100 transition-colors"
                >
                  <div className="flex items-center gap-1">
                    <span>Service / Product / Problem</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th className="px-4 py-3.5">
                  <div className="flex items-center gap-1">
                    <Hash className="w-3 h-3 text-slate-400" />
                    <span>Serial Number</span>
                  </div>
                </th>
                <th
                  onClick={() => handleSort('technicianName')}
                  className="px-4 py-3.5 cursor-pointer hover:bg-slate-100 transition-colors"
                >
                  <div className="flex items-center gap-1">
                    <span>Technician</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('status')}
                  className="px-4 py-3.5 cursor-pointer hover:bg-slate-100 transition-colors"
                >
                  <div className="flex items-center gap-1">
                    <span>Status</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('amount')}
                  className="px-4 py-3.5 text-right cursor-pointer hover:bg-slate-100 transition-colors"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Amount (₹)</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th className="px-3 py-3.5 text-center">Action</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
              {loading ? (
                <tr>
                  <td colSpan={10} className="p-12 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                      <span className="text-sm font-semibold">
                        Aggregating live transactions from Firebase RTDB...
                      </span>
                    </div>
                  </td>
                </tr>
              ) : paginatedRecords.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-12 text-center text-slate-500">
                    <div className="max-w-sm mx-auto space-y-2">
                      <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto text-slate-400">
                        <Search className="w-6 h-6" />
                      </div>
                      <h4 className="font-bold text-slate-800 text-base">
                        No Matching Records
                      </h4>
                      <p className="text-xs text-slate-500">
                        No transactions match your current filters. Try selecting All-Time Data or clearing the search query.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedRecords.map((item) => {
                  const isRepair = item.type === 'Repair Complaint';
                  const s = item.status.toLowerCase();
                  const isCompleted =
                    s.includes('completed') ||
                    s.includes('resolved') ||
                    s.includes('delivered');
                  const isPending = !isCompleted && !s.includes('cancelled');

                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-slate-50/80 transition-colors"
                    >
                      {/* Date & Time */}
                      <td className="px-4 py-3.5 whitespace-nowrap text-slate-600 text-[11px]">
                        {item.dateTime}
                      </td>

                      {/* Ticket / Order ID with Type Badge */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <div className="flex flex-col gap-1">
                          <span className="font-mono font-bold text-slate-900 tracking-tight">
                            {item.ticketOrOrderId}
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 w-fit px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              isRepair
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-blue-100 text-blue-800'
                            }`}
                          >
                            {isRepair ? (
                              <>
                                <Wrench className="w-2.5 h-2.5" />
                                <span>Repair</span>
                              </>
                            ) : (
                              <>
                                <ShoppingBag className="w-2.5 h-2.5" />
                                <span>Purchase</span>
                              </>
                            )}
                          </span>
                        </div>
                      </td>

                      {/* Customer Details */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <div className="font-bold text-slate-900">
                          {item.customerName}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          {item.phone}
                        </div>
                      </td>

                      {/* Address & Pincode */}
                      <td className="px-4 py-3.5 max-w-[200px]">
                        <div className="truncate text-slate-700" title={item.address}>
                          {item.address}
                        </div>
                        <div className="text-[11px] text-slate-500 font-bold font-mono">
                          PIN: {item.pincode}
                        </div>
                      </td>

                      {/* Service / Product / Problem */}
                      <td className="px-4 py-3.5 max-w-[220px]">
                        <div
                          className="font-semibold text-slate-900 truncate"
                          title={item.serviceOrProductName}
                        >
                          {item.serviceOrProductName}
                        </div>
                        <div
                          className="text-[11px] text-slate-500 truncate"
                          title={item.problemDetails}
                        >
                          {item.problemDetails}
                        </div>
                      </td>

                      {/* Serial Number */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 font-mono text-[11px] px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md border border-slate-200">
                          <Hash className="w-2.5 h-2.5 text-slate-400" />
                          <span>{item.serialNumber}</span>
                        </span>
                      </td>

                      {/* Technician */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span
                          className={`inline-block px-2.5 py-1 rounded-lg text-xs font-semibold ${
                            item.technicianName.toLowerCase() === 'unassigned'
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : 'bg-slate-100 text-slate-800'
                          }`}
                        >
                          {item.technicianName}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold ${
                            isCompleted
                              ? 'bg-emerald-100 text-emerald-800'
                              : isPending
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {isCompleted ? (
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          ) : isPending ? (
                            <Clock className="w-3 h-3 text-amber-600" />
                          ) : (
                            <X className="w-3 h-3 text-rose-600" />
                          )}
                          <span>{item.status}</span>
                        </span>
                      </td>

                      {/* Amount */}
                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        <span className="font-bold font-mono text-sm text-slate-900">
                          ₹{item.amount.toLocaleString('en-IN')}
                        </span>
                      </td>

                      {/* Action */}
                      <td className="px-3 py-3.5 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setViewingRecord(item)}
                          className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                          title="View Full Details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        <div className="p-4 sm:p-5 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-xs text-slate-500 font-medium">
            Showing{' '}
            <span className="font-bold text-slate-700">
              {sortedRecords.length === 0
                ? 0
                : (currentPage - 1) * rowsPerPage + 1}
            </span>{' '}
            to{' '}
            <span className="font-bold text-slate-700">
              {Math.min(currentPage * rowsPerPage, sortedRecords.length)}
            </span>{' '}
            of{' '}
            <span className="font-bold text-slate-700">
              {sortedRecords.length}
            </span>{' '}
            entries
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-2 border border-slate-200 rounded-lg bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-bold px-3 py-1 bg-white border border-slate-200 rounded-lg text-slate-800">
              Page {currentPage} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-2 border border-slate-200 rounded-lg bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* RECORD DETAILS MODAL */}
      {viewingRecord && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden animate-scaleUp">
            <div className="bg-slate-900 text-white p-6 flex items-center justify-between">
              <div>
                <span className="text-xs uppercase font-bold text-blue-400 tracking-wider">
                  {viewingRecord.type}
                </span>
                <h3 className="text-xl font-black mt-0.5">
                  {viewingRecord.ticketOrOrderId}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setViewingRecord(null)}
                className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                  <span className="text-[11px] font-bold uppercase text-slate-400">
                    Customer Name
                  </span>
                  <div className="font-bold text-slate-900 text-sm mt-0.5">
                    {viewingRecord.customerName}
                  </div>
                </div>

                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                  <span className="text-[11px] font-bold uppercase text-slate-400">
                    Phone Number
                  </span>
                  <div className="font-bold text-slate-900 text-sm mt-0.5 font-mono">
                    {viewingRecord.phone}
                  </div>
                </div>

                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                  <span className="text-[11px] font-bold uppercase text-slate-400">
                    Delivery Address
                  </span>
                  <div className="font-semibold text-slate-800 text-xs mt-0.5">
                    {viewingRecord.address}
                  </div>
                  <div className="text-[11px] font-bold text-slate-500 font-mono mt-0.5">
                    PIN: {viewingRecord.pincode}
                  </div>
                </div>

                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                  <span className="text-[11px] font-bold uppercase text-slate-400">
                    Serial Number
                  </span>
                  <div className="font-bold text-blue-700 text-sm mt-0.5 font-mono">
                    {viewingRecord.serialNumber}
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-[11px] font-bold uppercase text-slate-400">
                    Item / Appliance & Details
                  </span>
                  <span className="text-xs font-bold text-slate-700">
                    {viewingRecord.applianceCategory}
                  </span>
                </div>
                <div className="font-semibold text-slate-900 text-sm">
                  {viewingRecord.serviceOrProductName}
                </div>
                <div className="text-xs text-slate-600 bg-white p-2.5 rounded-lg border border-slate-200">
                  {viewingRecord.problemDetails}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-center">
                  <span className="text-[10px] font-bold uppercase text-slate-400">
                    Technician
                  </span>
                  <div className="font-bold text-slate-800 text-xs mt-0.5">
                    {viewingRecord.technicianName}
                  </div>
                </div>

                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-center">
                  <span className="text-[10px] font-bold uppercase text-slate-400">
                    Current Status
                  </span>
                  <div className="font-bold text-slate-800 text-xs mt-0.5">
                    {viewingRecord.status}
                  </div>
                </div>

                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-center">
                  <span className="text-[10px] font-bold uppercase text-slate-400">
                    Total Amount
                  </span>
                  <div className="font-black text-emerald-700 text-sm mt-0.5 font-mono">
                    ₹{viewingRecord.amount.toLocaleString('en-IN')}
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setViewingRecord(null)}
                className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
