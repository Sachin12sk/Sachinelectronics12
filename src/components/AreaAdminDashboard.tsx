import React, { useState, useEffect, useMemo } from "react";
import { useGlobalState } from "../context/GlobalContext";
import ErrorBoundary from "./ErrorBoundary";

import { db, complaintsCollection, techniciansCollection, inventoryCollection, areaAdminsCollection, leavesCollection, attendanceCollection } from "../lib/firebase";
import { onSnapshot, doc, updateDoc, deleteDoc, getDocs, setDoc, getDoc } from 'firebase/firestore';
import { Complaint } from "../types";
import { verifyPassword, normalizePincode, secureStorage } from "../lib/security";

function safeJSONParse(val: string | null, fallback: any) {
  if (!val) return fallback;
  try {
    return JSON.parse(val) || fallback;
  } catch (e) {
    return fallback;
  }
}

import {
  LogOut,
  Package,
  Users,
  FileText,
  CheckCircle,
  Clock,
  FileText as FileTextIcon,
  Trash2,
  Truck,
  Eye,
  Search,
  Phone,
  MapPin,
  Calendar,
  AlertCircle,
  Wrench,
  X
} from "lucide-react";
import InvoiceGeneratorModal from "./InvoiceGeneratorModal";
import AdminOrdersManager from "./AdminOrdersManager";

function InnerAreaAdminDashboard() {
  const { complaints, setComplaints, technicians, setTechnicians, areaAdmins, setAreaAdmins } = useGlobalState();
  const [currentAdmin, setCurrentAdmin] = useState<any>(() => {
    return safeJSONParse(sessionStorage.getItem('area_admin_session') || localStorage.getItem('area_admin_session'), null);
  });

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [areaComplaints, setAreaComplaints] = useState<Complaint[]>([]);

  const [activeTab, setActiveTab] = useState<
    "complaints" | "technicians" | "inventory" | "orders"
  >("complaints");
  const [taskFilter, setTaskFilter] = useState<'Active' | 'COMPLETED' | 'All'>('All');
  const [complaintSearch, setComplaintSearch] = useState('');
  const [viewingComplaint, setViewingComplaint] = useState<any>(null);
  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false);
  const [selectedInvoiceComplaint, setSelectedInvoiceComplaint] =
    useState<any>(null);
  const [leaves, setLeaves] = useState<any[]>([]);

  // Technician Alert & Assignment state
  const [assigningComplaint, setAssigningComplaint] = useState<any>(null);
  const [selectedTechId, setSelectedTechId] = useState<string>('');
  const [alertNote, setAlertNote] = useState<string>('');
  const [isAssigningTech, setIsAssigningTech] = useState<boolean>(false);
  const [alertBanner, setAlertBanner] = useState<string>('');

  useEffect(() => {
    const unsub = onSnapshot(leavesCollection, (snapshot) => {
      if (!snapshot.empty) {
        setLeaves(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      } else {
        setLeaves([]);
      }
    }, (err) => console.warn('Firestore leaves sync note:', err));
    return () => unsub();
  }, []);

  const handleApproveLeave = async (id: string, status: "Approved" | "Rejected") => {
    try {
      await updateDoc(doc(db, 'leaves', id), { status });
    } catch (e) {
      console.warn('Error updating leave status in Firestore:', e);
    }
  };
  
  const [inventory, setInventory] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<Record<string, any>>({});
  const [selectedTechs, setSelectedTechs] = useState<Record<string, string>>(
    {},
  );

  const currentAdminPincodes: string[] = useMemo(() => {
    const raw = currentAdmin?.pincodes || currentAdmin?.assignedPincodes || [];
    if (Array.isArray(raw)) {
      return raw.map((p: any) => normalizePincode(p)).filter(Boolean);
    }
    if (typeof raw === 'string') {
      return raw.split(',').map((p: any) => normalizePincode(p)).filter(Boolean);
    }
    return [];
  }, [currentAdmin?.pincodes, currentAdmin?.assignedPincodes]);

  // Validate session against Firestore
  useEffect(() => {
    const session = safeJSONParse(sessionStorage.getItem('area_admin_session') || localStorage.getItem('area_admin_session'), null);
    if (session && session.id) {
      setCurrentAdmin(session);
      setIsLoggedIn(true);

      getDoc(doc(db, 'areaAdmins', session.id)).then((docSnap) => {
        if (docSnap.exists()) {
          const freshData: any = { id: docSnap.id, ...docSnap.data() };
          if (freshData.isActive === false) {
            handleLogout();
            setLoginError("This Area Admin account has been deactivated by Super Admin.");
          } else {
            setCurrentAdmin(freshData);
          }
        } else {
          handleLogout();
        }
      }).catch((err) => {
        console.warn('Firestore session validation note:', err);
      });
    }
  }, []);

  // Real-time Cloud Firestore listener for PIN-based routing
  useEffect(() => {
    if (!currentAdmin) {
      setAreaComplaints([]);
      return;
    }

    const unsubFs = onSnapshot(complaintsCollection, (snapshot) => {
      if (!snapshot.empty) {
        const fsData = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as Complaint[];
        
        // Extract assigned PINs for current logged-in Area Admin
        const rawPins = [
          ...(Array.isArray(currentAdmin.pincodes) ? currentAdmin.pincodes : (typeof currentAdmin.pincodes === 'string' ? currentAdmin.pincodes.split(',') : [])),
          ...(Array.isArray(currentAdmin.assignedPincodes) ? currentAdmin.assignedPincodes : []),
          ...(Array.isArray(currentAdmin.normalizedPincodes) ? currentAdmin.normalizedPincodes : [])
        ];

        const adminPins: string[] = [];
        rawPins.forEach((p: any) => {
          const norm = normalizePincode(p);
          if (norm && !adminPins.includes(norm)) {
            adminPins.push(norm);
          }
        });

        // Filter complaints strictly matching this Area Admin's assigned PINs (or assigned directly)
        const matchingComplaints = fsData.filter((c: any) => {
          const compPin = normalizePincode(c.pincode || c.pinCode);
          const pinMatch = Boolean(compPin && adminPins.includes(compPin));
          const directAssignment = Boolean(c.assignedAreaAdminId && c.assignedAreaAdminId === currentAdmin.id);
          return pinMatch || directAssignment;
        });

        const sorted = matchingComplaints.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
        setAreaComplaints(sorted);
      } else {
        setAreaComplaints([]);
      }
    }, (error) => {
      console.warn('Error fetching Firestore area admin complaints note:', error);
      setAreaComplaints([]);
    });

    return () => unsubFs();
  }, [currentAdmin?.id, JSON.stringify(currentAdmin?.pincodes), JSON.stringify(currentAdmin?.assignedPincodes), JSON.stringify(currentAdmin?.normalizedPincodes)]);

  useEffect(() => {
    const unsubTechs = onSnapshot(techniciansCollection, (snapshot) => {
      if (!snapshot.empty) {
        const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        setTechnicians(data);
      } else {
        setTechnicians([]);
      }
    }, (err) => console.warn('Firestore techs sync note:', err));
    
    const unsubInv = onSnapshot(inventoryCollection, (snapshot) => {
      if (!snapshot.empty) {
        const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        setInventory(data);
      } else {
        setInventory([]);
      }
    }, (err) => console.warn('Firestore inventory sync note:', err));

    const unsubAtt = onSnapshot(attendanceCollection, (snapshot) => {
      if (!snapshot.empty) {
        const attObj: Record<string, any> = {};
        snapshot.docs.forEach(d => {
          attObj[d.id] = d.data();
        });
        setAttendance(attObj);
      } else {
        setAttendance({});
      }
    }, (err) => console.warn('Firestore attendance sync note:', err));

    const unsubAdmins = onSnapshot(areaAdminsCollection, (snapshot) => {
      if (!snapshot.empty) {
        const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        setAreaAdmins(list);
      } else {
        setAreaAdmins([]);
      }
    }, (err) => console.warn('Firestore areaAdmins sync note:', err));

    return () => {
      unsubTechs();
      unsubInv();
      unsubAtt();
      unsubAdmins();
    };
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    const inputId = email.trim();
    const inputPassword = password.trim();
    
    if (!inputId || !inputPassword) {
      setLoginError('Please enter both Login ID / Phone / Email and Password.');
      return;
    }

    try {
      // 1. Fetch fresh docs directly from Firestore
      let areaAdminsList: any[] = [];
      let firestoreError: string | null = null;
      try {
        const snapshot = await getDocs(areaAdminsCollection);
        if (!snapshot.empty) {
          areaAdminsList = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
        }
      } catch (err: any) {
        console.warn('Error fetching area admins via getDocs:', err);
        firestoreError = err?.message || 'Database connection error';
      }

      // 2. If getDocs returned empty or threw, fallback to real-time state or local cache
      if (areaAdminsList.length === 0 && Array.isArray(areaAdmins) && areaAdmins.length > 0) {
        areaAdminsList = areaAdmins;
      }
      if (areaAdminsList.length === 0) {
        const local = safeJSONParse(localStorage.getItem('app_area_admins'), []);
        if (Array.isArray(local) && local.length > 0) {
          areaAdminsList = local;
        }
      }

      // If still 0 across all sources, check whether it was a connectivity/permission error or truly empty database
      if (areaAdminsList.length === 0) {
        if (firestoreError) {
          setLoginError(`Database connection error: ${firestoreError}. Please check your internet connection.`);
        } else {
          setLoginError('No Area Admin accounts are registered in the system. Please ask Super Admin to create an Area Admin account.');
        }
        return;
      }

      const cleanInput = inputId.toLowerCase().trim();
      const phoneDigits = cleanInput.replace(/[^0-9]/g, '');
      const last10InputDigits = phoneDigits.slice(-10);

      // Match admin by Login ID, Email, Phone, Mobile, or Name (case-insensitive)
      const admin = areaAdminsList.find((a: any) => {
        const aLogin = (a.loginId || '').trim().toLowerCase();
        const aEmail = (a.email || '').trim().toLowerCase();
        const aName = (a.name || '').trim().toLowerCase();
        const aId = (a.id || '').trim().toLowerCase();
        const aPhoneDigits = (a.phone || '').replace(/[^0-9]/g, '');
        const aMobileDigits = (a.mobile || '').replace(/[^0-9]/g, '');

        const matchLogin = Boolean(aLogin && aLogin === cleanInput);
        const matchEmail = Boolean(aEmail && aEmail === cleanInput);
        const matchName = Boolean(aName && aName === cleanInput);
        const matchId = Boolean(aId && aId === cleanInput);

        const matchPhone = Boolean(
          last10InputDigits.length >= 7 && (
            aPhoneDigits.endsWith(last10InputDigits) ||
            aMobileDigits.endsWith(last10InputDigits) ||
            (aPhoneDigits && last10InputDigits.endsWith(aPhoneDigits.slice(-10)))
          )
        );

        return matchLogin || matchEmail || matchPhone || matchName || matchId;
      });

      if (!admin) {
        setLoginError(`No Area Admin account found matching "${inputId}". Please check your Login ID, registered phone number, or registered email.`);
        return;
      }

      if (admin.isActive === false) {
        setLoginError(`This Area Admin account (${admin.name || inputId}) has been deactivated by Super Admin. Please contact administration.`);
        return;
      }

      // Verify password (supports hash+salt or legacy plaintext with trim)
      let isPasswordValid = false;
      if (admin.passwordHash && admin.passwordSalt) {
        isPasswordValid = verifyPassword(inputPassword, admin.passwordHash, admin.passwordSalt);
        if (!isPasswordValid && inputPassword.trim() !== inputPassword) {
          isPasswordValid = verifyPassword(inputPassword.trim(), admin.passwordHash, admin.passwordSalt);
        }
      }
      if (!isPasswordValid && admin.password) {
        isPasswordValid = (admin.password === inputPassword) || (admin.password.trim() === inputPassword.trim());
      }

      if (!isPasswordValid) {
        setLoginError(`Incorrect password entered for Area Admin account "${admin.name || inputId}". Please check your password and try again.`);
        return;
      }

      // Safe session record (never store sensitive raw password in session)
      const rawPins = [
        ...(Array.isArray(admin.pincodes) ? admin.pincodes : (typeof admin.pincodes === 'string' ? admin.pincodes.split(',') : [])),
        ...(Array.isArray(admin.assignedPincodes) ? admin.assignedPincodes : (typeof admin.assignedPincodes === 'string' ? admin.assignedPincodes.split(',') : []))
      ].map((p: any) => String(p).trim()).filter(Boolean);

      const normalizedPins = rawPins.map((p: any) => normalizePincode(p)).filter(Boolean);
      const uniqueNormalizedPins = Array.from(new Set(normalizedPins));
      const uniqueRawPins = Array.from(new Set(rawPins));

      const sessionSafeAdmin = {
        id: admin.id,
        name: (admin.name || 'Area Admin').trim(),
        loginId: (admin.loginId || admin.email || admin.phone || 'area_admin').trim(),
        email: (admin.email || '').trim(),
        phone: (admin.phone || '').trim(),
        pincodes: uniqueRawPins,
        assignedPincodes: uniqueRawPins,
        normalizedPincodes: uniqueNormalizedPins,
        permissions: admin.permissions || { canEditInventory: true, canAlertTechs: true, canWA: true },
        isActive: true
      };

      setCurrentAdmin(sessionSafeAdmin);
      setIsLoggedIn(true);
      sessionStorage.setItem('area_admin_logged_in', 'true');
      sessionStorage.setItem('area_admin_session', JSON.stringify(sessionSafeAdmin));
      localStorage.setItem('area_admin_logged_in', 'true');
      localStorage.setItem('area_admin_session', JSON.stringify(sessionSafeAdmin));
    } catch(err: any) {
      console.error('Area Admin Login error:', err);
      setLoginError(`Authentication error: ${err?.message || 'Please check your connection and try again'}`);
    }
  };

  const handleSendTechnicianAlert = async (e?: React.FormEvent) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!assigningComplaint || !selectedTechId) {
      alert('Please select a technician to alert and assign.');
      return;
    }

    const tech = technicians?.find((t: any) => t.id === selectedTechId);
    if (!tech) {
      alert('Selected technician not found.');
      return;
    }

    setIsAssigningTech(true);
    try {
      const nowIso = new Date().toISOString();
      const techName = tech.name || 'Technician';

      const alertPayload = {
        complaintId: assigningComplaint.id,
        technicianId: tech.id,
        technicianName: techName,
        areaAdminId: currentAdmin?.id || '',
        areaAdminName: currentAdmin?.name || 'Area Admin',
        timestamp: nowIso,
        alertStatus: 'Alert Sent',
        note: alertNote.trim() || 'Assigned by Area Admin'
      };

      const updateData: Record<string, any> = {
        status: 'Assigned',
        assignedTechnicianId: tech.id,
        assignedTechnicianName: techName,
        assignedTechId: tech.id,
        assignedTo: techName,
        assignedAreaAdminId: currentAdmin?.id || '',
        assignedAreaAdminName: currentAdmin?.name || 'Area Admin',
        technicianAlert: alertPayload,
        statusUpdates: [
          ...(assigningComplaint.statusUpdates || []),
          {
            status: 'Assigned',
            timestamp: nowIso,
            updatedBy: `Area Admin (${currentAdmin?.name || 'Area Admin'})`,
            technicianName: techName,
            technicianId: tech.id,
            note: alertNote.trim() || 'Technician Alert Sent'
          }
        ],
        updatedAt: nowIso
      };

      await updateDoc(doc(db, 'complaints', assigningComplaint.id), updateData);

      const confirmMsg = `Alert sent successfully! Technician ${techName} has been assigned to Complaint #${assigningComplaint.jobCardId || assigningComplaint.id?.substring(0, 8).toUpperCase()}.`;
      setAlertBanner(confirmMsg);
      setTimeout(() => setAlertBanner(''), 6000);

      // If details modal was open for this complaint, update viewingComplaint
      if (viewingComplaint && viewingComplaint.id === assigningComplaint.id) {
        setViewingComplaint((prev: any) => ({
          ...prev,
          ...updateData
        }));
      }

      setAssigningComplaint(null);
      setSelectedTechId('');
      setAlertNote('');
    } catch (err: any) {
      console.error('Error assigning technician and sending alert:', err);
      alert('Failed to send technician alert: ' + (err?.message || 'Error'));
    } finally {
      setIsAssigningTech(false);
    }
  };

  const handleUpdateStatus = async (complaintId: string, newStatus: string) => {
    if (!complaintId || !newStatus) return;
    try {
      const nowIso = new Date().toISOString();
      const statusUpdateEntry = {
        status: newStatus,
        timestamp: nowIso,
        updatedBy: `Area Admin (${currentAdmin?.name || 'Area Admin'})`
      };

      await updateDoc(doc(db, 'complaints', complaintId), {
        status: newStatus,
        statusUpdates: [
          ...(viewingComplaint?.statusUpdates || []),
          statusUpdateEntry
        ],
        updatedAt: nowIso
      });

      const msg = `Complaint status updated to "${newStatus}" successfully.`;
      setAlertBanner(msg);
      setTimeout(() => setAlertBanner(''), 5000);

      if (viewingComplaint && viewingComplaint.id === complaintId) {
        setViewingComplaint((prev: any) => ({
          ...prev,
          status: newStatus,
          statusUpdates: [...(prev?.statusUpdates || []), statusUpdateEntry]
        }));
      }
    } catch (err: any) {
      console.error('Failed to update complaint status:', err);
      alert('Failed to update status: ' + (err?.message || 'Error'));
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setCurrentAdmin(null);
    setAreaComplaints([]);
    localStorage.removeItem('area_admin_logged_in');
    localStorage.removeItem('area_admin_session');
    localStorage.removeItem('app_current_area_admin');
    sessionStorage.removeItem('area_admin_logged_in');
    sessionStorage.removeItem('area_admin_session');
    window.location.hash = '';
  };

  // --- Technicians ---
  const [techName, setTechName] = useState("");
  const [techPhone, setTechPhone] = useState("");

  const handleAddTech = async (e: React.FormEvent) => {
    e.preventDefault();
    const newTech = {
      id: 'tech_' + Date.now().toString(),
      name: techName,
      phone: techPhone,
      mobile: techPhone,
      isActive: true,
      active: true,
      assignedCount: 0,
      createdAt: new Date().toISOString()
    };
    try {
      await setDoc(doc(db, 'technicians', newTech.id), newTech);
      setTechName("");
      setTechPhone("");
      alert("Technician added successfully!");
    } catch (err: any) {
      console.error("Error adding technician:", err);
      alert("Failed to add technician: " + (err?.message || "Error"));
    }
  };

  // --- Inventory ---
  const [invPart, setInvPart] = useState("");
  const [invQty, setInvQty] = useState("");
  const [invPrice, setInvPrice] = useState("");

  const handleAddInv = async (e: React.FormEvent) => {
    e.preventDefault();
    const newItem = {
      id: 'inv_' + Date.now().toString(),
      name: invPart,
      partName: invPart,
      stockQuantity: Number(invQty),
      quantity: Number(invQty),
      price: Number(invPrice),
      unitPrice: Number(invPrice),
      createdAt: new Date().toISOString()
    };
    try {
      await setDoc(doc(db, 'inventory', newItem.id), newItem);
      setInvPart("");
      setInvQty("");
      setInvPrice("");
      alert("Inventory item added successfully!");
    } catch (err: any) {
      console.error("Error adding inventory:", err);
      alert("Failed to add inventory: " + (err?.message || "Error"));
    }
  };

  // --- Complaints ---

  const handleDeleteComplaint = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this complaint? This action cannot be undone.')) {
      try {
        await deleteDoc(doc(db, 'complaints', id));
        alert('Deleted successfully');
      } catch (e: any) {
        console.warn('Error deleting complaint', e);
        alert('Failed to delete complaint: ' + (e?.message || 'Error'));
      }
    }
  };

  const handleAssignTech = async (complaintId: string, techId: string) => {
    const tech = technicians?.find((t: any) => t.id === techId);
    const techName = tech ? tech?.name : '';
    try {
      await updateDoc(doc(db, 'complaints', complaintId), {
        status: 'Assigned',
        assignedTechId: techId,
        assignedTo: techName,
        assignedTechnicianId: techId,
        assignedTechnicianName: techName,
        updatedAt: new Date().toISOString()
      });
      alert('Technician Assigned Successfully');
    } catch(err: any) {
      console.warn('Failed to assign tech', err);
      alert('Failed to assign technician: ' + (err?.message || 'Error'));
    }
  };

  const getComplaintWhatsAppUrl = (c: any) => {
    const rawPhone = String(c?.phone || c?.mobile || '').replace(/[^0-9]/g, '').slice(-10);
    if (!rawPhone) return '#';
    const customerName = c?.name || 'Customer';
    const jobCard = c?.jobCardId || (c?.id ? String(c.id).substring(0, 8).toUpperCase() : 'TICKET');
    const appliance = c?.product || c?.device || c?.appliance || 'Electrical Appliance';
    const status = c?.status || 'Pending';
    const techName = c?.assignedTechnicianName || c?.assignedTo || 'Assigned Technician';
    const remark = c?.technicianRemark ? `\n📝 *Technician Note:* ${c.technicianRemark}` : '';

    let message = `*Hello ${customerName},*\n\n`;
    message += `Live status update for your repair with *Sachin Electronics & Repairs*:\n\n`;
    message += `📌 *Job ID:* ${jobCard}\n`;
    message += `🔧 *Appliance:* ${appliance}\n`;
    message += `⚡ *Current Status:* ${status}\n`;
    
    if (status === 'Assigned' || status === 'In Progress') {
      message += `👨‍🔧 *Assigned Technician:* ${techName}\n`;
      message += `⏱️ *Update:* Technician is assigned and attending to your service.\n`;
    } else if (status === 'COMPLETED' || status === 'Completed' || status === 'Resolved') {
      message += `✅ *Resolution:* Your repair has been completed successfully.\n`;
      if (c?.resolutionDetails?.totalCost) {
        message += `🧾 *Total Bill:* ₹${c.resolutionDetails.totalCost}\n`;
      }
    } else {
      message += `⏱️ *Update:* Your request is logged and awaiting technician assignment.\n`;
    }

    if (remark) {
      message += `${remark}\n`;
    }

    message += `\nTrack your complaint online: https://sachin-electronics.web.app/#track-complaint\nContact: +91 83818 92161\nThank you for choosing Sachin Electricals!`;

    return `https://wa.me/91${rawPhone}?text=${encodeURIComponent(message)}`;
  };
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
          <div className="p-8 text-center bg-slate-900 text-white">
            <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center mx-auto mb-3 font-black text-xl shadow-lg shadow-blue-500/30">
              AA
            </div>
            <h2 className="text-2xl font-black tracking-tight">Area Admin Portal</h2>
            <p className="text-slate-400 text-sm mt-1">Sachin Electricals &bull; Regional Operations</p>
          </div>
          <form onSubmit={handleLogin} className="p-8 space-y-5">
            {loginError && (
              <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-bold text-center">
                {loginError}
              </div>
            )}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">Login ID / Phone / Email</label>
              <input
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 outline-none transition-all text-sm font-semibold"
                placeholder="Enter Login ID (e.g. loyalty or mobile)"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 outline-none transition-all text-sm"
                placeholder="Enter your password"
                required
              />
            </div>
            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl transition-all shadow-md shadow-blue-600/20 active:scale-[0.98] text-sm"
            >
              Sign In to Area Dashboard
            </button>
            <div className="text-center pt-2">
              <button 
                type="button" 
                onClick={() => { window.location.hash = ''; window.location.reload(); }}
                className="text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors"
              >
                &larr; Back to Main Website
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  const isToday = (dateStr?: string) => {
    if (!dateStr) return false;
    try {
      const d = new Date(dateStr);
      const now = new Date();
      return d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    } catch (e) {
      return false;
    }
  };

  const newComplaintsCount = areaComplaints.filter((c: any) => 
    isToday(c?.createdAt) || (c.status || '').toLowerCase() === 'new'
  ).length;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Top Professional Header */}
      <header className="w-full bg-slate-900 text-white px-6 py-3.5 flex flex-wrap justify-between items-center shadow-md z-30 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center font-black text-white text-base shadow-sm">
            AA
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-sm sm:text-base tracking-tight text-white">Sachin Electricals</span>
              <span className="text-[10px] uppercase tracking-wider font-bold bg-blue-500/20 text-blue-300 border border-blue-400/30 px-2 py-0.5 rounded-full">
                Area Admin Portal
              </span>
            </div>
            <div className="text-xs text-slate-300 mt-0.5 flex flex-wrap items-center gap-1.5 font-medium">
              <span>Admin:</span>
              <span className="text-white font-bold">{currentAdmin?.name || 'Area Admin'}</span>
              {currentAdmin?.loginId && (
                <span className="font-mono text-slate-400">(@{currentAdmin.loginId})</span>
              )}
              <span className="text-slate-500">&bull;</span>
              <span>Assigned PIN:</span>
              <span className="font-mono font-bold text-amber-300 bg-amber-400/10 px-1.5 py-0.5 rounded border border-amber-400/20">
                {(currentAdmin?.pincodes || currentAdmin?.assignedPincodes || []).join(', ') || 'None'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-2 sm:mt-0">
          <button 
            onClick={handleLogout}
            className="flex items-center gap-1.5 bg-rose-600 hover:bg-rose-700 text-white px-3.5 py-1.5 rounded-lg font-bold text-xs transition-colors shadow-sm active:scale-95"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      <div className="flex-1 flex flex-col md:flex-row">
        <aside className="w-full md:w-64 bg-white border-r border-slate-200 p-6 space-y-2 shrink-0">
          <div className="flex items-center gap-3 mb-6 p-3 bg-slate-50 rounded-xl border border-slate-100">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-md shadow-blue-200 shrink-0">
              <span className="text-white font-black text-lg">AA</span>
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="font-black text-slate-900 text-sm truncate leading-tight">
                {currentAdmin?.name || 'Area Admin'}
              </h1>
              {currentAdmin?.loginId && (
                <p className="text-[11px] font-mono text-slate-500 truncate">ID: {currentAdmin.loginId}</p>
              )}
              <p className="text-[11px] font-bold text-slate-400 uppercase mt-0.5 truncate">
                {(currentAdmin?.pincodes || currentAdmin?.assignedPincodes || [])?.length || 0} PIN(s) &bull; {areaComplaints?.length || 0} Tickets
              </p>
            </div>
          </div>

          <nav className="space-y-1.5">
            <button
              onClick={() => setActiveTab("complaints")}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl font-bold text-xs transition-colors ${activeTab === "complaints" ? "bg-blue-600 text-white shadow-sm" : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"}`}
            >
              <FileText className="w-4 h-4" />
              Regional Complaints
              {areaComplaints.length > 0 && (
                <span className={`ml-auto px-1.5 py-0.5 rounded-full text-[10px] font-black ${activeTab === "complaints" ? "bg-white/20 text-white" : "bg-blue-100 text-blue-700"}`}>
                  {areaComplaints.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab("technicians")}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl font-bold text-xs transition-colors ${activeTab === "technicians" ? "bg-blue-600 text-white shadow-sm" : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"}`}
            >
              <Users className="w-4 h-4" />
              Area Technicians
            </button>
            <button
              onClick={() => setActiveTab("inventory")}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl font-bold text-xs transition-colors ${activeTab === "inventory" ? "bg-blue-600 text-white shadow-sm" : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"}`}
            >
              <Package className="w-4 h-4" />
              Inventory & Spares
            </button>
            <button
              onClick={() => setActiveTab("orders")}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl font-bold text-xs transition-colors ${activeTab === "orders" ? "bg-blue-600 text-white shadow-sm" : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"}`}
            >
              <Truck className="w-4 h-4" />
              Customer Orders
            </button>
            <div className="pt-4 border-t border-slate-100">
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl font-bold text-xs text-rose-600 hover:bg-rose-50 border border-rose-100 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          </nav>
        </aside>

        <main className="flex-1 p-6 md:p-8 overflow-y-auto">
          {activeTab === "complaints" && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">
                    Regional Complaints
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Assigned PINs: <span className="font-mono font-bold text-blue-600">{(currentAdmin?.pincodes || currentAdmin?.assignedPincodes || []).join(', ') || 'All Areas'}</span>
                  </p>
                </div>

                {/* Search Bar */}
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={complaintSearch}
                    onChange={(e) => setComplaintSearch(e.target.value)}
                    placeholder="Search by name, phone, PIN, problem..."
                    className="pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-blue-500 w-64 shadow-sm"
                  />
                </div>
              </div>

              {alertBanner && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm animate-fadeIn">
                  <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{alertBanner}</span>
                </div>
              )}

              {/* 5 Summary Stat Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Complaints</div>
                  <div className="text-2xl font-black text-slate-900 mt-1">{areaComplaints.length}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">Assigned PIN area</div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <div className="text-[11px] font-bold text-indigo-600 uppercase tracking-wider">New Today</div>
                  <div className="text-2xl font-black text-indigo-600 mt-1">{newComplaintsCount}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">New bookings</div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <div className="text-[11px] font-bold text-amber-600 uppercase tracking-wider">Pending</div>
                  <div className="text-2xl font-black text-amber-600 mt-1">
                    {areaComplaints.filter((c: any) => (c.status || '').toLowerCase() === 'pending').length}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">Awaiting technician</div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <div className="text-[11px] font-bold text-blue-600 uppercase tracking-wider">In Progress</div>
                  <div className="text-2xl font-black text-blue-600 mt-1">
                    {areaComplaints.filter((c: any) => ['assigned', 'in progress', 'in-progress'].includes((c.status || '').toLowerCase())).length}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">Dispatched</div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <div className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider">Resolved</div>
                  <div className="text-2xl font-black text-emerald-600 mt-1">
                    {areaComplaints.filter((c: any) => ['completed', 'resolved'].includes((c.status || '').toLowerCase())).length}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">Successfully closed</div>
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap gap-2">
                    <button 
                      onClick={() => setTaskFilter('Active')} 
                      className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-colors ${taskFilter === 'Active' ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}
                    >
                      🔴 Pending / Active
                    </button>
                    <button 
                      onClick={() => setTaskFilter('COMPLETED')} 
                      className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-colors ${taskFilter === 'COMPLETED' ? 'bg-green-600 text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}
                    >
                      🟢 Completed
                    </button>
                    <button 
                      onClick={() => setTaskFilter('All')} 
                      className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-colors ${taskFilter === 'All' ? 'bg-slate-800 text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}
                    >
                      📁 All History
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  {(() => {
                    const displayed = areaComplaints.filter((c: any) => {
                      if (taskFilter === 'Active' && (c?.status === 'COMPLETED' || c?.status === 'Resolved')) {
                        return false;
                      }
                      if (taskFilter === 'COMPLETED' && c?.status !== 'COMPLETED' && c?.status !== 'Resolved') {
                        return false;
                      }
                      if (complaintSearch.trim()) {
                        const q = complaintSearch.toLowerCase().trim();
                        const name = String(c?.name || '').toLowerCase();
                        const phone = String(c?.phone || '').toLowerCase();
                        const pin = String(c?.pincode || c?.pinCode || '').toLowerCase();
                        const prod = String(c?.product || '').toLowerCase();
                        const issue = String(c?.issue || '').toLowerCase();
                        const id = String(c?.id || '').toLowerCase();
                        return name.includes(q) || phone.includes(q) || pin.includes(q) || prod.includes(q) || issue.includes(q) || id.includes(q);
                      }
                      return true;
                    });

                    if (displayed.length === 0) {
                      return (
                        <div className="text-center py-12 p-6">
                          <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-2">
                            <FileText className="w-6 h-6" />
                          </div>
                          <p className="text-sm font-bold text-slate-700">No complaints found</p>
                          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                            {complaintSearch || taskFilter !== 'All' 
                              ? 'Try adjusting your search query or filter.' 
                              : `No complaints currently lodged for assigned PIN code(s): ${(currentAdmin?.pincodes || []).join(', ') || 'None'}.`}
                          </p>
                        </div>
                      );
                    }

                    return (
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Customer Details</th>
                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Address & PIN</th>
                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Appliance & Problem</th>
                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Status</th>
                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Assign Tech</th>
                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {displayed.map((c: any) => (
                            <tr key={c.id} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-6 py-4">
                                <p className="font-bold text-slate-900">{c?.name}</p>
                                <p className="text-sm text-slate-500">{c?.phone}</p>
                                <p className="text-xs font-bold text-slate-400 mt-1 font-mono">{c.jobCardNumber || c.id}</p>
                              </td>
                              <td className="px-6 py-4">
                                <p className="text-sm text-slate-700">{c.address || "N/A"}</p>
                                <span className="inline-block mt-1 px-2 py-0.5 bg-blue-50 border border-blue-200 rounded text-xs font-mono font-bold text-blue-700">
                                  PIN: {c?.pincode || c?.pinCode}
                                </span>
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-2">
                                  <p className="font-bold text-slate-900">{c.product || 'Appliance'}</p>
                                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                    c?.priority === 'High' ? 'bg-red-100 text-red-700' :
                                    c?.priority === 'Medium' ? 'bg-amber-100 text-amber-700' :
                                    'bg-slate-100 text-slate-600'
                                  }`}>
                                    {c?.priority || 'Normal'}
                                  </span>
                                </div>
                                <p className="text-sm text-slate-500 mt-0.5">{c?.issue}</p>
                                <p className="text-[11px] text-slate-400 mt-1">
                                  {c.createdAt ? new Date(c.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'N/A'}
                                </p>
                              </td>
                              <td className="px-6 py-4">
                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold ${
                                  c?.status === "Pending" ? "bg-orange-50 text-orange-700" :
                                  c?.status === "Assigned" ? "bg-blue-50 text-blue-700" :
                                  "bg-green-50 text-green-700"
                                }`}>
                                  {c?.status === "COMPLETED" && <CheckCircle className="w-3.5 h-3.5" />}
                                  {c?.status === "Assigned" && <Users className="w-3.5 h-3.5" />}
                                  {c?.status === "Pending" && <Clock className="w-3.5 h-3.5" />}
                                  {c?.status}
                                </span>
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex flex-col gap-1.5 min-w-[140px]">
                                  {c?.status !== "COMPLETED" && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setAssigningComplaint(c);
                                        setSelectedTechId(c.assignedTechnicianId || selectedTechs[c.id] || '');
                                        setAlertNote('');
                                      }}
                                      className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg transition-all shadow-sm whitespace-nowrap active:scale-95"
                                    >
                                      <Wrench className="w-3.5 h-3.5" />
                                      <span>{c.assignedTechnicianId ? 'Re-Alert Tech' : 'Alert / Assign Tech'}</span>
                                    </button>
                                  )}
                                  {c?.assignedTechnicianName && (
                                    <div className="text-xs text-slate-700 bg-slate-50 p-1.5 rounded border border-slate-100">
                                      <p className="font-semibold text-slate-500 text-[11px]">Assigned Tech:</p>
                                      <p className="font-bold text-blue-700">{c.assignedTechnicianName}</p>
                                      {c.technicianAlert?.alertStatus && (
                                        <span className="inline-block mt-0.5 text-[10px] bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded font-bold">
                                          {c.technicianAlert.alertStatus}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                  {!c.assignedTechnicianName && c?.status === "COMPLETED" && (
                                    <span className="text-xs text-slate-400 font-medium">Completed</span>
                                  )}
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex flex-col gap-1.5 min-w-[120px]">
                                  <button
                                    type="button"
                                    onClick={() => setViewingComplaint(c)}
                                    className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-lg text-xs transition-colors"
                                  >
                                    <Eye className="w-3.5 h-3.5 text-blue-600" />
                                    <span>View Details</span>
                                  </button>
                                  <a
                                    href={getComplaintWhatsAppUrl(c)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 bg-emerald-600 text-white font-bold rounded-lg text-xs hover:bg-emerald-700 transition-colors shadow-sm"
                                  >
                                    💬 WhatsApp
                                  </a>
                                  <button
                                    onClick={() => {
                                      setSelectedInvoiceComplaint(c);
                                      setInvoiceModalOpen(true);
                                    }}
                                    className="inline-flex items-center justify-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 font-bold rounded-lg text-xs hover:bg-blue-100 transition-colors"
                                  >
                                    <FileTextIcon className="w-3.5 h-3.5" /> Invoice
                                  </button>
                                  <button
                                    onClick={() => handleDeleteComplaint(c.id)}
                                    className="inline-flex items-center justify-center gap-1 px-2.5 py-1 bg-red-50 text-red-700 font-bold rounded-lg text-xs hover:bg-red-100 transition-colors"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" /> Delete
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    );
                  })()}
                </div>
              </div>
            </div>
          )}

          {activeTab === "technicians" && (
            <div className="space-y-6">
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
                  <h3 className="font-bold text-slate-900 text-lg">
                    Add Technician
                  </h3>
                </div>
                <form
                  onSubmit={handleAddTech}
                  className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4"
                >
                  <input
                    required
                    type="text"
                    placeholder="Technician Name"
                    value={techName}
                    onChange={(e) => setTechName(e.target.value)}
                    className="px-4 py-2 border border-slate-300 rounded-lg"
                  />
                  <input
                    required
                    type="tel"
                    placeholder="Contact Number"
                    value={techPhone}
                    onChange={(e) => setTechPhone(e.target.value)}
                    className="px-4 py-2 border border-slate-300 rounded-lg"
                  />
                  <button
                    type="submit"
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-blue-700"
                  >
                    Add Technician
                  </button>
                </form>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
                  <h3 className="font-bold text-slate-900 text-lg">
                    Area Technicians
                  </h3>
                </div>
                <div className="divide-y divide-slate-200">
                  {technicians?.length === 0 ? (
                    <div className="p-8 text-center text-slate-500">
                      No technicians added yet.
                    </div>
                  ) : (
                    [
                      ...new Map(
                        technicians?.map((t) => [
                          t.id || t.phone || Math.random(),
                          t,
                        ]),
                      ).values(),
                    ]?.map((tech) => (
                      <div
                        key={tech?.id}
                        className="p-6 flex items-center justify-between"
                      >
                        <div>
                          <div className="font-bold text-slate-900">
                            {tech?.name}
                          </div>
                          <div className="text-sm text-slate-500">
                            {tech?.phone}
                          </div>
                          <p className="text-sm text-slate-500 mb-1">
                            <span className="font-semibold">Base Salary:</span>{" "}
                            <span className="text-green-600 font-bold">
                              ₹{tech.baseSalary || 15000}
                            </span>
                          </p>
                          <div className="mt-2 flex items-center gap-2">
                            {(() => {
                              const att = attendance[tech?.id];
                              const isOn = att?.isOnShift;
                              return (
                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${
                                  isOn ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                                }`}>
                                  <span className={`w-2 h-2 rounded-full ${isOn ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                                  {isOn ? 'On Shift' : 'Off Shift'}
                                  {att?.lastShiftStart && (
                                    <span className="font-normal text-[11px] ml-1">
                                      {isOn
                                        ? `(Started ${new Date(att.lastShiftStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`
                                        : `(Ended ${new Date(att.lastShiftEnd || att.lastShiftStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`}
                                    </span>
                                  )}
                                </span>
                              );
                            })()}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-medium text-slate-900">
                            Complaints: {tech.assignedCount || 0}
                          </div>
                          <span
                            className={`inline-block mt-1 px-2 py-0.5 rounded text-xs font-bold uppercase ${tech.active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}
                          >
                            {tech.active ? "Active" : "Inactive"}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="mt-8 bg-white/70 backdrop-blur-xl rounded-2xl shadow-sm border border-slate-200/60 p-6">
                <h2 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
                  🌴 Leave Requests
                </h2>
                <div className="overflow-x-auto">
                  


                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-y border-slate-200">
                        <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider">
                          Date
                        </th>
                        <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider">
                          Technician
                        </th>
                        <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider">
                          Reason
                        </th>
                        <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider">
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {leaves
                        ?.filter((l) => l.status === "Pending")
                        ?.map((leave) => (
                          <tr key={leave.id} className="hover:bg-slate-50/50">
                            <td className="py-3 px-4 text-sm font-medium">
                              {leave.date}
                            </td>
                            <td className="py-3 px-4 text-sm font-bold">
                              {leave.techName}
                            </td>
                            <td className="py-3 px-4 text-sm text-slate-600">
                              {leave.reason}
                            </td>
                            <td className="py-3 px-4">
                              <span className="px-2 py-1 bg-orange-100 text-orange-700 font-bold text-xs rounded-lg">
                                Pending
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex gap-2">
                                <button
                                  onClick={() =>
                                    handleApproveLeave(leave.id, "Approved")
                                  }
                                  className="px-3 py-1.5 bg-green-100 text-green-700 font-bold text-xs rounded-lg hover:bg-green-200 transition-colors"
                                >
                                  Approve
                                </button>
                                <button
                                  onClick={() =>
                                    handleApproveLeave(leave.id, "Rejected")
                                  }
                                  className="px-3 py-1.5 bg-red-100 text-red-700 font-bold text-xs rounded-lg hover:bg-red-200 transition-colors"
                                >
                                  Reject
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      {leaves?.filter((l) => l.status === "Pending")?.length ===
                        0 && (
                        <tr>
                          <td
                            colSpan={5}
                            className="py-6 text-center text-slate-500 text-sm"
                          >
                            No pending leave requests.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === "inventory" && (
            <div className="space-y-6">
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
                  <h3 className="font-bold text-slate-900 text-lg">
                    Add Spare Part
                  </h3>
                </div>
                <form
                  onSubmit={handleAddInv}
                  className="p-6 grid grid-cols-1 md:grid-cols-4 gap-4"
                >
                  <input
                    required
                    type="text"
                    placeholder="Part Name (e.g. Capacitor)"
                    value={invPart}
                    onChange={(e) => setInvPart(e.target.value)}
                    className="px-4 py-2 border border-slate-300 rounded-lg md:col-span-2"
                  />
                  <input
                    required
                    type="number"
                    placeholder="Quantity"
                    value={invQty}
                    onChange={(e) => setInvQty(e.target.value)}
                    className="px-4 py-2 border border-slate-300 rounded-lg"
                  />
                  <input
                    required
                    type="number"
                    placeholder="Unit Price (₹)"
                    value={invPrice}
                    onChange={(e) => setInvPrice(e.target.value)}
                    className="px-4 py-2 border border-slate-300 rounded-lg"
                  />
                  <button
                    type="submit"
                    className="md:col-span-4 bg-blue-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-blue-700"
                  >
                    Add to Stock
                  </button>
                </form>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
                  <h3 className="font-bold text-slate-900 text-lg">
                    Current Stock
                  </h3>
                </div>
                <div className="divide-y divide-slate-200">
                  {inventory?.length === 0 ? (
                    <div className="p-8 text-center text-slate-500">
                      No inventory items added yet.
                    </div>
                  ) : (
                    inventory?.map((item) => (
                      <div
                        key={item.id}
                        className="p-6 flex items-center justify-between"
                      >
                        <div>
                          <div className="font-bold text-slate-900">
                            {item.partName}
                          </div>
                          <div className="text-sm text-slate-500">
                            ₹{item.unitPrice} per unit
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xl font-bold text-slate-900">
                            {item.quantity}
                          </div>
                          <div className="text-xs text-slate-500 uppercase tracking-wider">
                            In Stock
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === "orders" && (
            <div className="space-y-6">
              <AdminOrdersManager
                userRole="area_admin"
                allowedPincodes={currentAdminPincodes}
              />
            </div>
          )}
        </main>
      </div>

      {invoiceModalOpen && selectedInvoiceComplaint && (
          <InvoiceGeneratorModal
            complaint={selectedInvoiceComplaint}
            onClose={() => {
              setInvoiceModalOpen(false);
              setSelectedInvoiceComplaint(null);
            }}
          />
        )}

        {viewingComplaint && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-200 my-8">
              <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold">Complaint Details</h3>
                    <span className="text-xs font-mono bg-slate-800 px-2 py-0.5 rounded text-slate-300">
                      {viewingComplaint.jobCardId || viewingComplaint.id?.substring(0, 8).toUpperCase()}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Logged on: {viewingComplaint.createdAt ? new Date(viewingComplaint.createdAt).toLocaleString('en-IN') : 'N/A'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setViewingComplaint(null)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Customer Information</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-slate-500 font-medium">Customer Name</p>
                      <p className="text-sm font-bold text-slate-900 mt-0.5">{viewingComplaint.name || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 font-medium">Phone Number</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-sm font-bold text-slate-900">{viewingComplaint.phone || viewingComplaint.mobile || 'N/A'}</span>
                        {viewingComplaint.phone && (
                          <a
                            href={`tel:${viewingComplaint.phone}`}
                            className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                            title="Call Customer"
                          >
                            <Phone className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                    </div>
                    <div className="sm:col-span-2">
                      <p className="text-xs text-slate-500 font-medium">Address</p>
                      <p className="text-sm text-slate-800 mt-0.5 flex items-start gap-1.5">
                        <MapPin className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                        <span>{viewingComplaint.address || 'N/A'}</span>
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 font-medium">PIN Code</p>
                      <span className="inline-block mt-0.5 px-2.5 py-1 bg-blue-100 text-blue-800 rounded font-mono font-bold text-xs">
                        {viewingComplaint.pincode || viewingComplaint.pinCode || 'N/A'}
                      </span>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 font-medium">Timeslot / Availability</p>
                      <p className="text-sm font-medium text-slate-800 mt-0.5">{viewingComplaint.timeslot || 'Anytime'}</p>
                    </div>
                  </div>
                </div>

                <div className="border border-slate-200 rounded-xl p-4">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Appliance & Issue Details</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-slate-500 font-medium">Appliance / Product</p>
                      <p className="text-base font-bold text-slate-900 mt-0.5">
                        {viewingComplaint.product || viewingComplaint.device || viewingComplaint.appliance || 'Electrical Appliance'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 font-medium">Priority Level</p>
                      <span className={`inline-block mt-0.5 px-2 py-0.5 rounded text-xs font-bold ${
                        viewingComplaint.priority === 'High' ? 'bg-red-100 text-red-700' :
                        viewingComplaint.priority === 'Medium' ? 'bg-amber-100 text-amber-700' :
                        'bg-slate-100 text-slate-700'
                      }`}>
                        {viewingComplaint.priority || 'Normal'}
                      </span>
                    </div>
                    <div className="sm:col-span-2">
                      <p className="text-xs text-slate-500 font-medium">Reported Problem / Issue</p>
                      <p className="text-sm text-slate-800 bg-slate-50 p-3 rounded-lg mt-1 border border-slate-100 whitespace-pre-wrap">
                        {viewingComplaint.issue || 'No description provided.'}
                      </p>
                    </div>
                    {viewingComplaint.issueImageUrl && (
                      <div className="sm:col-span-2">
                        <p className="text-xs text-slate-500 font-medium mb-1">Issue Photo</p>
                        <img
                          src={viewingComplaint.issueImageUrl}
                          alt="Complaint attachment"
                          className="rounded-lg max-h-48 object-cover border border-slate-200"
                        />
                      </div>
                    )}
                  </div>
                </div>

                <div className="border border-slate-200 rounded-xl p-4 bg-slate-50">
                  <div className="flex flex-wrap justify-between items-center gap-2 mb-3">
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Status & Assignment</h4>
                    <button
                      type="button"
                      onClick={() => {
                        setAssigningComplaint(viewingComplaint);
                        setSelectedTechId(viewingComplaint.assignedTechnicianId || '');
                        setAlertNote('');
                      }}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 active:scale-95"
                    >
                      <Wrench className="w-3.5 h-3.5" />
                      <span>{viewingComplaint.assignedTechnicianId ? 'Re-Alert / Assign Tech' : 'Alert / Assign Technician'}</span>
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-slate-500 font-medium">Current Status</p>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold ${
                          viewingComplaint.status === 'COMPLETED' || viewingComplaint.status === 'Resolved' ? 'bg-emerald-100 text-emerald-800' :
                          viewingComplaint.status === 'Assigned' || viewingComplaint.status === 'In Progress' ? 'bg-blue-100 text-blue-800' :
                          'bg-amber-100 text-amber-800'
                        }`}>
                          {viewingComplaint.status || 'Pending'}
                        </span>
                        <div className="flex items-center gap-1">
                          <label className="text-[11px] text-slate-500">Update:</label>
                          <select
                            value={viewingComplaint.status || 'Pending'}
                            onChange={(e) => handleUpdateStatus(viewingComplaint.id, e.target.value)}
                            className="px-2 py-1 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
                          >
                            <option value="Pending">Pending</option>
                            <option value="Assigned">Assigned</option>
                            <option value="In Progress">In Progress</option>
                            <option value="COMPLETED">Completed</option>
                          </select>
                        </div>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 font-medium">Assigned Technician</p>
                      <p className="text-sm font-bold text-slate-900 mt-1">
                        {viewingComplaint.assignedTechnicianName || viewingComplaint.assignedTo || 'Unassigned'}
                      </p>
                    </div>
                    {viewingComplaint.technicianAlert && (
                      <div className="sm:col-span-2 p-3 bg-blue-50/80 border border-blue-200 rounded-xl text-xs space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-blue-900 flex items-center gap-1.5">
                            <Wrench className="w-3.5 h-3.5 text-blue-600" />
                            Technician Alert Dispatched
                          </span>
                          <span className="px-2 py-0.5 bg-blue-600 text-white font-bold rounded text-[10px]">
                            {viewingComplaint.technicianAlert.alertStatus || 'Alert Sent'}
                          </span>
                        </div>
                        <p className="text-blue-800">
                          Assigned to <span className="font-bold">{viewingComplaint.technicianAlert.technicianName}</span> on {new Date(viewingComplaint.technicianAlert.timestamp).toLocaleString('en-IN')}.
                        </p>
                        {viewingComplaint.technicianAlert.note && (
                          <p className="text-blue-700 italic mt-0.5">Instructions: "{viewingComplaint.technicianAlert.note}"</p>
                        )}
                      </div>
                    )}
                    {viewingComplaint.technicianRemark && (
                      <div className="sm:col-span-2">
                        <p className="text-xs text-slate-500 font-medium">Technician Remark</p>
                        <p className="text-sm text-slate-700 bg-white p-2.5 rounded border border-slate-200 mt-0.5">
                          {viewingComplaint.technicianRemark}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {viewingComplaint.resolutionDetails && (
                  <div className="border border-emerald-200 rounded-xl p-4 bg-emerald-50/50">
                    <h4 className="text-xs font-bold text-emerald-800 uppercase tracking-wider mb-2">Resolution Details</h4>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-xs text-slate-500">Replaced Part:</span>
                        <p className="font-bold text-slate-800">{viewingComplaint.resolutionDetails.replacedPartName || 'None'}</p>
                      </div>
                      <div>
                        <span className="text-xs text-slate-500">Total Cost:</span>
                        <p className="font-bold text-emerald-700">₹{viewingComplaint.resolutionDetails.totalCost || 0}</p>
                      </div>
                      <div>
                        <span className="text-xs text-slate-500">Payment Status:</span>
                        <p className="font-bold text-slate-800">{viewingComplaint.resolutionDetails.paymentStatus || 'Pending'}</p>
                      </div>
                      <div>
                        <span className="text-xs text-slate-500">Payment Method:</span>
                        <p className="font-bold text-slate-800">{viewingComplaint.resolutionDetails.paymentMethod || 'Cash'}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
                <a
                  href={getComplaintWhatsAppUrl(viewingComplaint)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition-colors shadow-sm"
                >
                  💬 Send WhatsApp Update
                </a>
                <button
                  type="button"
                  onClick={() => setViewingComplaint(null)}
                  className="px-5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-xl text-xs transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Technician Alert & Assignment Modal */}
        {assigningComplaint && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 animate-fadeIn my-8">
              <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
                    <Wrench className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold">Alert / Assign Technician</h3>
                    <p className="text-xs text-slate-400 font-mono">
                      Complaint #{assigningComplaint.jobCardId || assigningComplaint.id?.substring(0, 8).toUpperCase()}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setAssigningComplaint(null);
                    setSelectedTechId('');
                    setAlertNote('');
                  }}
                  className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSendTechnicianAlert} className="p-6 space-y-4">
                {/* Complaint Summary */}
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs space-y-1.5">
                  <div className="flex justify-between items-start">
                    <span className="font-bold text-slate-900">{assigningComplaint.name || 'Customer'}</span>
                    <span className="font-mono font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                      PIN: {assigningComplaint.pincode || assigningComplaint.pinCode || 'N/A'}
                    </span>
                  </div>
                  <p className="text-slate-600">
                    <span className="font-semibold text-slate-700">Appliance:</span> {assigningComplaint.product || 'Appliance'} &bull; <span className="font-semibold text-slate-700">Issue:</span> {assigningComplaint.issue || 'Service request'}
                  </p>
                  <p className="text-slate-500 truncate">
                    <span className="font-semibold text-slate-700">Address:</span> {assigningComplaint.address || 'N/A'}
                  </p>
                </div>

                {/* Technician Selection from existing Firestore technicians */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Select Available Technician <span className="text-rose-500">*</span>
                  </label>
                  {technicians?.length === 0 ? (
                    <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-xs">
                      No technicians registered yet. Please add a technician in the Area Technicians tab.
                    </div>
                  ) : (
                    <select
                      value={selectedTechId}
                      onChange={(e) => setSelectedTechId(e.target.value)}
                      required
                      className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
                    >
                      <option value="">-- Select Technician --</option>
                      {technicians?.map((t: any) => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({t.phone || t.mobile || 'No Phone'}) {t.skills ? `• ${t.skills}` : ''}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Alert Note */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Technician Alert Note / Work Instructions (Optional)
                  </label>
                  <textarea
                    value={alertNote}
                    onChange={(e) => setAlertNote(e.target.value)}
                    rows={3}
                    placeholder="Enter instructions for technician, e.g. 'Carry spare capacitor, customer available after 3 PM'"
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
                  />
                </div>

                {/* Modal Actions */}
                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => {
                      setAssigningComplaint(null);
                      setSelectedTechId('');
                      setAlertNote('');
                    }}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isAssigningTech || !selectedTechId}
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-blue-500/20 flex items-center gap-1.5"
                  >
                    {isAssigningTech ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Dispatching Alert...</span>
                      </>
                    ) : (
                      <>
                        <Wrench className="w-3.5 h-3.5" />
                        <span>Send Alert & Assign</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
}


export default function AreaAdminDashboard(props: any) {
  return (
    <ErrorBoundary>
      <InnerAreaAdminDashboard {...props} />
    </ErrorBoundary>
  );
}
