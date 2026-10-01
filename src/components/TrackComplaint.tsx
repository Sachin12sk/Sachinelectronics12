import React, { useState, useEffect } from 'react';
import { db, complaintsCollection, techniciansCollection } from '../lib/firebase';
import { onSnapshot } from 'firebase/firestore';
import { Complaint, Technician } from '../types';
import { Search, Phone, Wrench, CheckCircle2, Clock, AlertCircle, User, MessageCircle, FileText, ChevronRight, Calendar, MapPin, Sparkles } from 'lucide-react';
import { generateInvoice } from '../utils/generateInvoice';

export default function TrackComplaint() {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isSearched, setIsSearched] = useState(false);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [selectedComplaint, setSelectedComplaint] = useState<Complaint | null>(null);

  // Sync technicians for contact details from Firestore
  useEffect(() => {
    const unsubFirestoreTech = onSnapshot(techniciansCollection, (snapshot) => {
      if (!snapshot.empty) {
        const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as Technician[];
        setTechnicians(list);
      } else {
        setTechnicians([]);
      }
    }, (err) => console.warn("Firestore technicians sync note:", err));

    return () => {
      unsubFirestoreTech();
    };
  }, []);

  // Sync complaints in real-time from Cloud Firestore
  useEffect(() => {
    const unsubFs = onSnapshot(complaintsCollection, (snapshot) => {
      if (!snapshot.empty) {
        const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Complaint[];
        setComplaints(list);
      } else {
        setComplaints([]);
      }
    }, (err) => {
      console.warn("Firestore complaints listener note:", err?.message || err);
    });

    return () => {
      unsubFs();
    };
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (phoneNumber.trim().length >= 10) {
      setIsSearched(true);
    }
  };

  const cleanPhone = (p: string | undefined | null) => {
    if (!p) return '';
    return String(p).replace(/[^0-9]/g, '').slice(-10);
  };

  const searchedClean = cleanPhone(phoneNumber);

  const matchedComplaints = isSearched && searchedClean
    ? complaints.filter(c => {
        const cPhone = cleanPhone(c.phone || (c as any).mobile);
        const cId = String(c.id || '').toLowerCase();
        const cJob = String((c as any).jobCardId || '').toLowerCase();
        return cPhone === searchedClean || cId === searchedClean.toLowerCase() || cJob === searchedClean.toLowerCase();
      }).sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
    : [];

  const getStatusColor = (status: string | undefined) => {
    switch (status) {
      case 'Completed':
      case 'COMPLETED':
      case 'Resolved':
        return 'bg-emerald-100 text-emerald-800 border-emerald-300';
      case 'In Progress':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'Assigned':
        return 'bg-indigo-100 text-indigo-800 border-indigo-300';
      case 'Pending - Part Required':
      case 'On Hold':
        return 'bg-amber-100 text-amber-800 border-amber-300';
      case 'Pending':
      default:
        return 'bg-amber-100 text-amber-800 border-amber-300';
    }
  };

  const getStepIndex = (status: string | undefined) => {
    if (!status) return 0;
    if (status === 'COMPLETED' || status === 'Completed' || status === 'Resolved') return 3;
    if (status === 'In Progress') return 2;
    if (status === 'Assigned' || status === 'Pending - Part Required' || status === 'On Hold') return 1;
    return 0; // Pending
  };

  const getTechnicianInfo = (complaint: Complaint) => {
    const techId = complaint.assignedTechnicianId || (complaint as any).assignedTechId;
    const directTech = technicians.find(t => t.id === techId);
    const techName = complaint.assignedTechnicianName || (complaint as any).assignedTo || directTech?.name || 'Technician Assigned';
    const techPhone = (complaint as any).technicianPhone || directTech?.phone || directTech?.mobile || '';
    return { techName, techPhone };
  };

  return (
    <section id="track-complaint" className="py-16 bg-gradient-to-b from-slate-50 to-blue-50/50 border-t border-slate-200">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-100 text-blue-800 text-xs font-bold uppercase tracking-wider mb-3">
            <Sparkles className="w-3.5 h-3.5" /> Live Service Tracking
          </div>
          <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight sm:text-4xl">
            Track Your Repair Request
          </h2>
          <p className="mt-3 text-slate-600 text-base">
            Enter your 10-digit registered phone number to view live status updates, assigned technician details, and service progress.
          </p>
        </div>

        {/* Search Box Card */}
        <div className="bg-white rounded-2xl shadow-xl shadow-blue-900/5 border border-slate-200 p-6 sm:p-8 max-w-2xl mx-auto mb-12">
          <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="tel"
                value={phoneNumber}
                onChange={(e) => {
                  setPhoneNumber(e.target.value);
                  if (e.target.value.length === 10) setIsSearched(true);
                }}
                maxLength={13}
                placeholder="Enter 10-digit Phone Number..."
                required
                className="w-full pl-12 pr-4 py-3.5 bg-slate-50 rounded-xl border border-slate-300 text-slate-900 font-medium text-base focus:bg-white focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-all"
              />
            </div>
            <button
              type="submit"
              className="px-8 py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md shadow-blue-600/20 transition-all flex items-center justify-center gap-2 text-base shrink-0"
            >
              <Search className="w-5 h-5" />
              Track Status
            </button>
          </form>

          {isSearched && (
            <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
              <span>Showing results for: <strong className="text-slate-800 font-mono">+91 {searchedClean}</strong></span>
              <button
                type="button"
                onClick={() => {
                  setPhoneNumber('');
                  setIsSearched(false);
                }}
                className="text-blue-600 hover:underline font-semibold"
              >
                Clear Search
              </button>
            </div>
          )}
        </div>

        {/* Results Section */}
        {isSearched && (
          <div className="space-y-6">
            {matchedComplaints.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center max-w-md mx-auto shadow-sm">
                <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <AlertCircle className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">No Active Complaints Found</h3>
                <p className="text-slate-600 text-sm mb-6">
                  We couldn't find any service request registered with phone number <span className="font-mono font-bold text-slate-800">+91 {searchedClean}</span>.
                </p>
                <a
                  href="#complaint"
                  className="inline-flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm transition-all"
                >
                  <Wrench className="w-4 h-4" /> Book a New Repair
                </a>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6">
                {matchedComplaints.map((c) => {
                  const currentStep = getStepIndex(c.status);
                  const { techName, techPhone } = getTechnicianInfo(c);
                  const remark = (c as any).technicianRemark;

                  return (
                    <div
                      key={c.id}
                      className="bg-white rounded-2xl border border-slate-200 shadow-md hover:shadow-lg transition-all overflow-hidden"
                    >
                      {/* Top Header Bar */}
                      <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-lg">
                            <Wrench className="w-5 h-5" />
                          </span>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-base font-bold text-slate-900">{c.product || 'Appliance Repair'}</h3>
                              <span className="text-xs font-mono text-slate-500 bg-slate-200/70 px-2 py-0.5 rounded">
                                ID: {c.jobCardId || (c.id ? c.id.substring(0, 8).toUpperCase() : 'N/A')}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                              <Calendar className="w-3.5 h-3.5" /> Booked on {new Date(c.createdAt || Date.now()).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className={`px-3 py-1 text-xs font-bold rounded-full border ${getStatusColor(c.status)}`}>
                            {c.status || 'Pending'}
                          </span>
                        </div>
                      </div>

                      <div className="p-6">
                        {/* 4-Step Visual Progress Bar */}
                        <div className="mb-8">
                          <div className="grid grid-cols-4 gap-2 relative">
                            {/* Connecting Line */}
                            <div className="absolute top-4 left-[12%] right-[12%] h-1 bg-slate-200 -z-0">
                              <div
                                className="h-full bg-blue-600 transition-all duration-500"
                                style={{
                                  width: `${(currentStep / 3) * 100}%`
                                }}
                              />
                            </div>

                            {/* Step 1: Registered */}
                            <div className="flex flex-col items-center text-center relative z-10">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${currentStep >= 0 ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-200 text-slate-600'}`}>
                                <CheckCircle2 className="w-4 h-4" />
                              </div>
                              <span className="mt-2 text-xs font-bold text-slate-800">Pending</span>
                              <span className="text-[10px] text-slate-500 hidden sm:inline">Request Logged</span>
                            </div>

                            {/* Step 2: Assigned */}
                            <div className="flex flex-col items-center text-center relative z-10">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${currentStep >= 1 ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-200 text-slate-600'}`}>
                                {currentStep >= 1 ? <CheckCircle2 className="w-4 h-4" /> : '2'}
                              </div>
                              <span className={`mt-2 text-xs font-bold ${currentStep >= 1 ? 'text-blue-600' : 'text-slate-500'}`}>Assigned</span>
                              <span className="text-[10px] text-slate-500 hidden sm:inline">Tech Allocated</span>
                            </div>

                            {/* Step 3: In Progress */}
                            <div className="flex flex-col items-center text-center relative z-10">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${currentStep >= 2 ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-200 text-slate-600'}`}>
                                {currentStep >= 2 ? <CheckCircle2 className="w-4 h-4" /> : '3'}
                              </div>
                              <span className={`mt-2 text-xs font-bold ${currentStep >= 2 ? 'text-blue-600' : 'text-slate-500'}`}>In Progress</span>
                              <span className="text-[10px] text-slate-500 hidden sm:inline">Repair Underway</span>
                            </div>

                            {/* Step 4: Completed */}
                            <div className="flex flex-col items-center text-center relative z-10">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${currentStep >= 3 ? 'bg-emerald-600 text-white shadow-md' : 'bg-slate-200 text-slate-600'}`}>
                                {currentStep >= 3 ? <CheckCircle2 className="w-4 h-4" /> : '4'}
                              </div>
                              <span className={`mt-2 text-xs font-bold ${currentStep >= 3 ? 'text-emerald-700' : 'text-slate-500'}`}>Completed</span>
                              <span className="text-[10px] text-slate-500 hidden sm:inline">Resolved</span>
                            </div>
                          </div>
                        </div>

                        {/* Complaint Details Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                          {/* Left Column: Issue details */}
                          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Issue Reported</h4>
                            <p className="text-sm font-medium text-slate-800 mb-3">{c.issue || 'General repair / service check'}</p>
                            
                            <div className="space-y-1.5 text-xs text-slate-600">
                              <div className="flex items-center gap-1.5">
                                <Clock className="w-3.5 h-3.5 text-slate-400" />
                                <span>Preferred Slot: <strong>{c.timeslot || 'Morning (10 AM - 12 PM)'}</strong></span>
                              </div>
                              {c.address && (
                                <div className="flex items-start gap-1.5">
                                  <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                                  <span className="line-clamp-2">{c.address} (PIN: {c.pincode})</span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Right Column: Assigned Technician Details */}
                          <div className="bg-blue-50/70 p-4 rounded-xl border border-blue-200">
                            <h4 className="text-xs font-bold text-blue-700 uppercase tracking-wider mb-2">Assigned Technician</h4>
                            {c.assignedTechnicianId || (c as any).assignedTo ? (
                              <div>
                                <div className="flex items-center gap-3 mb-3">
                                  <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-base shadow-sm">
                                    <User className="w-5 h-5" />
                                  </div>
                                  <div>
                                    <h5 className="text-sm font-bold text-slate-900">{techName}</h5>
                                    <p className="text-xs text-blue-600 font-medium">Verified Senior Field Technician</p>
                                  </div>
                                </div>

                                <div className="flex flex-wrap gap-2 mt-2">
                                  {techPhone && (
                                    <>
                                      <a
                                        href={`tel:${techPhone}`}
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-colors shadow-sm"
                                      >
                                        <Phone className="w-3.5 h-3.5" /> Call Tech
                                      </a>
                                      <a
                                        href={`https://wa.me/91${cleanPhone(techPhone)}?text=${encodeURIComponent(`Hello ${techName}, I am contacting you regarding my repair complaint for ${c.product} (Job ID: ${c.jobCardId || c.id}).`)}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-colors shadow-sm"
                                      >
                                        <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                                      </a>
                                    </>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <div className="text-center py-4">
                                <Clock className="w-6 h-6 text-blue-400 mx-auto mb-1 animate-pulse" />
                                <p className="text-xs font-semibold text-slate-700">Assigning Area Technician...</p>
                                <p className="text-[11px] text-slate-500 mt-1">Our area coordinator is assigning the best technician for your location.</p>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Remark Note if any */}
                        {remark && (
                          <div className="mb-4 p-3 bg-amber-50 rounded-xl border border-amber-200 flex items-start gap-2.5">
                            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                            <div>
                              <p className="text-xs font-bold text-amber-900">Technician Update / Note:</p>
                              <p className="text-xs text-amber-800 mt-0.5">{remark}</p>
                            </div>
                          </div>
                        )}

                        {/* If Completed - Show Invoice Download */}
                        {(c.status === 'Completed' || c.status === 'COMPLETED' || c.status === 'Resolved') && (
                          <div className="pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
                            <div className="text-xs text-slate-600">
                              <span>Service Completed successfully. </span>
                              {c.resolutionDetails?.totalCost && (
                                <span className="font-bold text-slate-900">Total Bill: ₹{c.resolutionDetails.totalCost}</span>
                              )}
                            </div>
                            <button
                              onClick={() => generateInvoice(c)}
                              className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-black text-white text-xs font-bold rounded-lg transition-colors shadow-sm"
                            >
                              <FileText className="w-4 h-4" /> Download PDF Invoice
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
