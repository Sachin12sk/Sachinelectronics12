import { ref, get, update, remove, onValue } from 'firebase/database';
import React, { useState, useEffect } from "react";
import { useGlobalState } from "../context/GlobalContext";
import ErrorBoundary from "./ErrorBoundary";

import { rtdb, db, complaintsCollection } from "../lib/firebase";
import { onSnapshot, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { Complaint } from "../types";


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
  Truck
} from "lucide-react";
import InvoiceGeneratorModal from "./InvoiceGeneratorModal";
import AdminOrdersManager from "./AdminOrdersManager";

function InnerAreaAdminDashboard() {
  const { complaints, setComplaints, technicians, setTechnicians, areaAdmins, setAreaAdmins } = useGlobalState();
  const adminInfo = safeJSONParse(localStorage.getItem('area_admin_session'), null) || { name: 'Area Admin', area: 'All', pincodes: [] };
  const currentAdminPincodes = adminInfo.pincodes || [];

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  const [activeTab, setActiveTab] = useState<
    "complaints" | "technicians" | "inventory" | "orders"
  >("complaints");
  const [taskFilter, setTaskFilter] = useState<'Active' | 'COMPLETED' | 'All'>('All');
  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false);
  const [selectedInvoiceComplaint, setSelectedInvoiceComplaint] =
    useState<any>(null);
  const [leaves, setLeaves] = useState<any[]>([]);
  useEffect(() => {
    const leavesRef = ref(rtdb, 'leaves');
    const unsub = onValue(leavesRef, (snapshot) => {
      if (snapshot.exists()) {
        const val = snapshot.val();
        setLeaves(Object.keys(val).map(key => ({ id: key, ...val[key] })));
      } else {
        setLeaves([]);
      }
    });
    return () => unsub();
  }, []);

  const handleApproveLeave = (id: string, status: "Approved" | "Rejected") => {
    update(ref(rtdb, 'leaves/' + id), { status }).catch(e => console.warn(e));
  };
  
  
  const [inventory, setInventory] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<Record<string, any>>({});
  const [selectedTechs, setSelectedTechs] = useState<Record<string, string>>(
    {},
  );

  useEffect(() => {
    const loggedInStr = localStorage.getItem("area_admin_logged_in");
    if (loggedInStr === "true") {
      setIsLoggedIn(true);
      fetchData();
    }
  }, []);

  
  useEffect(() => {
    // 1. Cloud Firestore real-time listener
    const unsubFs = onSnapshot(complaintsCollection, (snapshot) => {
      if (!snapshot.empty) {
        let fsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Complaint[];
        
        const sessionData = safeJSONParse(localStorage.getItem('area_admin_session'), null);
        const currentAdminPincodes = sessionData?.pincodes || sessionData?.assignedPincodes || [sessionData?.pincode] || [];
        const adminPincodesArray = String(currentAdminPincodes || '').split(',').map(p => p.trim());
        
        const filtered = fsData.filter((complaint: any) => {
          const compPin = String(complaint.pincode || complaint.pinCode || '').trim();
          return adminPincodesArray.some(adminPin => adminPin === compPin);
        });

        const sorted = (filtered.length > 0 ? filtered : fsData).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setComplaints(sorted);
      }
    }, (error) => {
      console.warn('Error fetching Firestore area admin complaints note:', error);
    });

    // 2. Also listen to RTDB if active
    let unsubscribe = () => {};
    try {
      const complaintsRef = ref(rtdb, 'complaints');
      unsubscribe = onValue(complaintsRef, (snapshot) => {
        if (snapshot.exists()) {
          const val = snapshot.val();
          let rtdbData = Object.keys(val).map(key => ({ id: key, ...val[key] })) as Complaint[];
          
          const sessionData = safeJSONParse(localStorage.getItem('area_admin_session'), null);
          const currentAdminPincodes = sessionData?.pincodes || sessionData?.assignedPincodes || [sessionData?.pincode] || [];
          
          const adminPincodesArray = String(currentAdminPincodes || '')
            .split(',')
            .map(p => p.trim());
          
          const filteredComplaints = rtdbData.filter((complaint: any) => {
             const compPin = String(complaint.pincode || complaint.pinCode || '').trim();
             return adminPincodesArray.some(adminPin => adminPin === compPin);
          });
          
          const sorted = filteredComplaints.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          setComplaints(prev => {
            const merged = [...prev, ...sorted];
            return [...new Map(merged.map(item => [item.id, item])).values()].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          });
        }
      }, () => {});
    } catch(e) {}

    return () => {
      unsubFs();
      unsubscribe();
    };
  }, []);


  
  useEffect(() => {
    const techsRef = ref(rtdb, 'technicians');
    const unsubTechs = onValue(techsRef, (snapshot) => {
      if (snapshot.exists()) {
        const val = snapshot.val();
        const data = Object.keys(val).map(key => ({ id: key, ...val[key] }));
        setTechnicians(data);
      } else {
        setTechnicians([]);
      }
    });
    
    const invRef = ref(rtdb, 'inventory');
    const unsubInv = onValue(invRef, (snapshot) => {
      if (snapshot.exists()) {
        const val = snapshot.val();
        const data = Object.keys(val).map(key => ({ id: key, ...val[key] }));
        setInventory(data);
      } else {
        setInventory([]);
      }
    });

    const attRef = ref(rtdb, 'attendance');
    const unsubAtt = onValue(attRef, (snapshot) => {
      if (snapshot.exists()) {
        setAttendance(snapshot.val());
      } else {
        setAttendance({});
      }
    });

    return () => {
      unsubTechs();
      unsubInv();
      unsubAtt();
    };
  }, []);

  const fetchData = async () => {};

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();
    
    try {
      const { get, ref } = await import('firebase/database');
      const snapshot = await get(ref(rtdb, 'areaAdmins'));
      let areaAdmins: any[] = [];
      if (snapshot.exists()) {
        const val = snapshot.val();
        areaAdmins = Object.keys(val).map(key => ({ id: key, ...val[key] }));
      }
      
      const admin = areaAdmins?.find((a: any) => 
        (a.phone === trimmedEmail || a.mobile === trimmedEmail || a.loginId === trimmedEmail || a.email === trimmedEmail) 
        && a.password === trimmedPassword
      );
      
      if (admin) {
        setIsLoggedIn(true);
        localStorage.setItem("area_admin_logged_in", "true");
        localStorage.setItem("area_admin_session", JSON.stringify(admin));
        localStorage.setItem("app_current_area_admin", JSON.stringify(admin));
        window.location.reload();
      } else {
        setLoginError("Invalid Mobile Number or Password. Please check Super Admin panel.");
      }
    } catch(err) {
      console.warn("Login err", err);
      setLoginError("Network error. Please try again.");
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    localStorage.removeItem("area_admin_logged_in");
    localStorage.removeItem("area_admin_session");
    window.location.hash = "";
  };

  // --- Technicians ---
  const [techName, setTechName] = useState("");
  const [techPhone, setTechPhone] = useState("");

  const handleAddTech = (e: React.FormEvent) => {
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
    import('firebase/database').then(({set, ref}) => {
       set(ref(rtdb, 'technicians/' + newTech.id), newTech).catch(e => console.warn(e));
    });
    setTechName("");
    setTechPhone("");
  };

  // --- Inventory ---
  const [invPart, setInvPart] = useState("");
  const [invQty, setInvQty] = useState("");
  const [invPrice, setInvPrice] = useState("");

  const handleAddInv = (e: React.FormEvent) => {
    e.preventDefault();
    const newItem = {
      id: 'inv_' + Date.now().toString(),
      name: invPart,
      partName: invPart,
      stockQuantity: Number(invQty),
      quantity: Number(invQty),
      price: Number(invPrice),
      unitPrice: Number(invPrice),
    };
    import('firebase/database').then(({set, ref}) => {
       set(ref(rtdb, 'inventory/' + newItem.id), newItem).catch(e => console.warn(e));
    });
    setInvPart("");
    setInvQty("");
    setInvPrice("");
  };

  // --- Complaints ---

  const handleDeleteComplaint = (id: string) => {
    if (window.confirm('Are you sure you want to delete this complaint? This action cannot be undone.')) {
      remove(ref(rtdb, 'complaints/' + id)).then(() => {
        alert('Deleted successfully');
      }).catch(e => {
        console.warn('Error deleting complaint', e);
        alert('Failed to delete complaint');
      });
    }
  };

  const handleAssignTech = async (complaintId: string, techId: string) => {
    const tech = technicians?.find((t: any) => t.id === techId);
    const techName = tech ? tech?.name : '';
    try {
      const complaintRef = ref(rtdb, 'complaints/' + complaintId);
      await update(complaintRef, {
        status: 'Assigned',
        assignedTechId: techId,
        assignedTo: techName,
        assignedTechnicianId: techId,
        assignedTechnicianName: techName,
      });
      alert('Technician Assigned Successfully');
    } catch(err) {
      console.warn('Failed to assign tech', err);
      alert('Failed to assign technician');
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
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
          <div className="p-8 text-center bg-blue-600">
            <h2 className="text-2xl font-black text-white">Area Admin Portal</h2>
            <p className="text-blue-100 mt-2 font-medium">Please sign in to continue</p>
          </div>
          <form onSubmit={handleLogin} className="p-8 space-y-6">
            {loginError && (
              <div className="p-4 bg-red-50 border border-red-100 text-red-600 rounded-xl text-sm font-bold text-center">
                {loginError}
              </div>
            )}
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Mobile Number / Admin ID</label>
              <input
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
                placeholder="Enter mobile or ID"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
                placeholder="Enter password"
                required
              />
            </div>
            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl transition-all active:scale-[0.98]"
            >
              Secure Login
            </button>
            <div className="text-center mt-6">
              <button 
                type="button" 
                onClick={() => { window.location.hash = ''; window.location.reload(); }}
                className="text-sm font-bold text-slate-500 hover:text-slate-800"
              >
                ← Back to Home
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
      <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">

      <div className="w-full bg-slate-900 text-white px-6 py-4 flex justify-between items-center shadow-md z-50">
        <div className="font-bold text-lg tracking-tight">Sachin Electricals</div>
        <button 
          onClick={() => { setIsLoggedIn(false); localStorage.removeItem('area_admin_logged_in'); localStorage.removeItem('area_admin_session'); window.location.hash = '#home'; }}
          className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-bold text-sm transition-colors"
        >
          <span>Exit / Switch Role</span>
        </button>
      </div>
    
        <aside className="w-full md:w-64 bg-white border-r border-slate-200 p-6 space-y-2">
          <div className="flex items-center gap-2 mb-8">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-200">
              <span className="text-white font-black text-xl">AA</span>
            </div>
            <div>
              <h1 className="font-black text-slate-900 text-lg leading-tight">
                Area Admin
              </h1>
              <p className="text-xs font-bold text-slate-400 uppercase">
                {(adminInfo?.assignedPincodes || adminInfo?.pincodes || [])?.length || 0} Pincodes &bull; {complaints?.length || 0} Complaints</p>
            </div>
          </div>

          <nav className="space-y-2">
            <button
              onClick={() => setActiveTab("complaints")}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${activeTab === "complaints" ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"}`}
            >
              <FileText className="w-5 h-5" />
              Regional Complaints
            </button>
            <button
              onClick={() => setActiveTab("technicians")}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${activeTab === "technicians" ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"}`}
            >
              <Users className="w-5 h-5" />
              Area Technicians
            </button>
            <button
              onClick={() => setActiveTab("inventory")}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${activeTab === "inventory" ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"}`}
            >
              <Package className="w-5 h-5" />
              Inventory & Spare Parts
            </button>
            <button
              onClick={() => setActiveTab("orders")}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${activeTab === "orders" ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"}`}
            >
              <Truck className="w-5 h-5" />
              Customer Orders
            </button>
          </nav>
        </aside>

        <main className="flex-1 p-6 md:p-10 overflow-y-auto">
          {activeTab === "complaints" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-slate-900">
                  Regional Complaints
                </h2>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                  
                  <div className="flex flex-wrap gap-2 mb-6">
                    <button 
                      onClick={() => setTaskFilter('Active')} 
                      className={`px-4 py-2 rounded-lg font-bold text-sm transition-colors ${taskFilter === 'Active' ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}
                    >
                      🔴 Pending / Active Tasks
                    </button>
                    <button 
                      onClick={() => setTaskFilter('COMPLETED')} 
                      className={`px-4 py-2 rounded-lg font-bold text-sm transition-colors ${taskFilter === 'COMPLETED' ? 'bg-green-600 text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}
                    >
                      🟢 Completed Tasks
                    </button>
                    <button 
                      onClick={() => setTaskFilter('All')} 
                      className={`px-4 py-2 rounded-lg font-bold text-sm transition-colors ${taskFilter === 'All' ? 'bg-slate-800 text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}
                    >
                      📁 All Complaints History
                    </button>
                  </div>

                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">
                          Customer details
                        </th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">
                          Address & PIN
                        </th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">
                          Issue & Device
                        </th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">
                          Status
                        </th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">
                          Assign Tech
                        </th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">
                          Quick Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {complaints?.filter((c: any) => taskFilter === 'All' ? true : taskFilter === 'Active' ? c?.status !== 'COMPLETED' : c?.status === 'COMPLETED')
  ?.sort((a: any, b: any) => {
    const statusOrder: any = { "Pending": 0, "Assigned": 1, "COMPLETED": 2 };
    const aOrder = statusOrder[a.status] ?? 3;
    const bOrder = statusOrder[b.status] ?? 3;
    if (aOrder !== bOrder) return aOrder - bOrder;
    const aTime = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const bTime = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return bTime - aTime;
  })
  ?.map((c: any) => (
                        <tr
                          key={c.id}
                          className="hover:bg-slate-50/50 transition-colors"
                        >
                          <td className="px-6 py-4">
                            <p className="font-bold text-slate-900">{c?.name}</p>
                            <p className="text-sm text-slate-500">{c?.phone}</p>
                            <p className="text-xs font-bold text-slate-400 mt-1">
                              {c.jobCardNumber || "N/A"}
                            </p>
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-sm text-slate-700">
                              {c.address || "N/A"}
                            </p>
                            <span className="inline-block mt-1 px-2 py-1 bg-slate-100 rounded text-xs font-bold text-slate-600">
                              {c?.pincode}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <p className="font-bold text-slate-900">
                              {c.product}
                            </p>
                            <p className="text-sm text-slate-500">{c?.issue}</p>
                          </td>
                          <td className="px-6 py-4">
                            <span
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold ${
                                c?.status === "Pending"
                                  ? "bg-orange-50 text-orange-700"
                                  : c?.status === "Assigned"
                                    ? "bg-blue-50 text-blue-700"
                                    : "bg-green-50 text-green-700"
                              }`}
                            >
                              {c?.status === "COMPLETED" && (
                                <CheckCircle className="w-3.5 h-3.5" />
                              )}
                              {c?.status === "Assigned" && (
                                <Users className="w-3.5 h-3.5" />
                              )}
                              {c?.status === "Pending" && (
                                <Clock className="w-3.5 h-3.5" />
                              )}
                              {c?.status}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-col gap-2">
                              {c?.status !== "COMPLETED" && (
                                <div className="flex items-center gap-2">
                                  <select
  value={selectedTechs[c.id] || ""}
  onChange={(e) => setSelectedTechs({ ...selectedTechs, [c.id]: e.target.value })}
  className="px-2 py-1.5 border border-slate-300 rounded-lg text-sm flex-1 min-w-[120px]"
>
  <option value="">Select Tech...</option>
  {technicians?.filter((t: any) => {
    const compPin = String(c.pincode || c.pinCode || '').trim();
    if (!compPin) return true;
    
    let tPins = [];
    if (Array.isArray(t.pincodes)) {
      tPins = t.pincodes.map((p) => String(p).trim());
    }
    const techPin = String(t.pinCode || t.pincode || '').trim();
    if (techPin) tPins.push(techPin);

    return tPins.includes(compPin);
  }).map((t: any) => (
    <option key={t.id} value={t.id}>
      {t.name}
    </option>
  ))}
</select>
                                  <button
                                    onClick={() => handleAssignTech(c.id, selectedTechs[c.id])}
                                    disabled={!selectedTechs[c.id]}
                                    className="px-3 py-1.5 bg-blue-600 text-white font-bold text-xs rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                                  >
                                    Assign Tech
                                  </button>
                                </div>
                              )}
                              {c?.status === "Assigned" && c?.assignedTechnicianName && (
                                <p className="text-xs font-bold text-slate-500">
                                  Assigned to: {c.assignedTechnicianName}
                                </p>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-col gap-2">
                              <a
                                href={getComplaintWhatsAppUrl(c)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-600 text-white font-bold rounded-lg text-xs hover:bg-emerald-700 transition-colors shadow-sm whitespace-nowrap"
                                title="Send automated WhatsApp status update to customer"
                              >
                                💬 WhatsApp Notification
                              </a>
                              <a
                                href={`https://wa.me/91${c?.phone}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center justify-center gap-2 px-3 py-1.5 bg-green-50 text-green-700 font-bold rounded-lg text-xs hover:bg-green-100 transition-colors"
                              >
                                Direct Chat
                              </a>
                              <button
                                onClick={() => {
                                  setSelectedInvoiceComplaint(c);
                                  setInvoiceModalOpen(true);
                                }}
                                className="inline-flex items-center justify-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-700 font-bold rounded-lg text-xs hover:bg-blue-100 transition-colors"
                              >
                                <FileTextIcon className="w-4 h-4" /> Gen Invoice
                              </button>
                              <button
                                onClick={() => handleDeleteComplaint(c.id)}
                                className="inline-flex items-center justify-center gap-2 px-3 py-1.5 bg-red-50 text-red-700 font-bold rounded-lg text-xs hover:bg-red-100 transition-colors mt-1 w-full"
                              >
                                <Trash2 className="w-4 h-4" /> Delete
                              </button>
                            </div>
                          </td>

                                {c?.status === "COMPLETED" && (
                                  <div className="flex flex-col gap-2">
                                    <a
                                      href={`https://wa.me/91${c?.mobile}?text=${encodeURIComponent(`Hello ${c?.name},\nYour repair ticket ${c.jobCardId || c.id} has been successfully completed!\n\n🧾 Total Bill Amount: ₹${c.resolutionDetails?.totalCost || 0}\n🛠️ Service: ${c?.issue}\n\nThank you for choosing Sachin Electronics Sales and Service Center!`)}`}
                                      target="_blank" rel="noopener noreferrer"
                                      className="px-3 py-1.5 bg-green-500 text-white font-bold text-xs rounded hover:bg-green-600 flex items-center justify-center whitespace-nowrap"
                                    >
                                      WhatsApp Invoice
                                    </a>
                                    <button 
                                      onClick={() => window.print()}
                                      className="px-3 py-1.5 bg-slate-800 text-white font-bold text-xs rounded hover:bg-slate-900 flex items-center justify-center whitespace-nowrap"
                                    >
                                      Gen Invoice
                                    </button>
                                  </div>
                                )}

                        </tr>
                      ))}
                      {complaints?.length === 0 && (
                        <tr>
                          <td
                            colSpan={5}
                            className="px-6 py-12 text-center text-slate-500"
                          >
                            <div className="flex flex-col items-center justify-center gap-2">
                              <CheckCircle className="w-8 h-8 text-slate-300" />
                              <p>No complaints in your area.</p>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
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

        {invoiceModalOpen && selectedInvoiceComplaint && (
          <InvoiceGeneratorModal
            complaint={selectedInvoiceComplaint}
            onClose={() => {
              setInvoiceModalOpen(false);
              setSelectedInvoiceComplaint(null);
            }}
          />
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
