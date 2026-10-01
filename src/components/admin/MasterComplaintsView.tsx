import React, { useState, useMemo } from 'react';
import { Complaint } from '../../types';
import { Search, MapPin, User, Settings, CheckCircle, Clock, AlertTriangle, Trash2, MessageCircle } from 'lucide-react';

interface Props {
  handleAssignTechnician?: (complaintId: string, techId: string, techName: string) => void;
  complaints: Complaint[];
  user: { role: string; name?: string; id?: string; pincodes?: string[] };
  pincodeFilter: string;
  setPincodeFilter: (p: string) => void;
  statusFilter: string;
  setStatusFilter: (s: string) => void;
  searchPhone: string;
  setSearchPhone: (s: string) => void;
  handleOpenAssignModal?: (id: string) => void;
  handleOpenResolveModal?: (id: string) => void;
  handleUpdateStatus?: (id: string) => void;
  handleOpenHistory?: (phone: string) => void;
  technicians?: any[];
  areaAdmins?: any[];
  handleAssignAreaAdmin?: (id: string, adminId: string, adminName: string) => void;
  handleDeleteComplaint?: (id: string) => void;
}

export default function MasterComplaintsView({
  complaints, user, pincodeFilter, setPincodeFilter,
  statusFilter, setStatusFilter, searchPhone, setSearchPhone,
  handleOpenAssignModal, handleOpenResolveModal, handleUpdateStatus, handleOpenHistory,
  technicians,
  areaAdmins,
  handleAssignAreaAdmin,
  handleDeleteComplaint
}: Props) {

  const filteredComplaints = useMemo(() => {
    return complaints?.filter(c => {
      const cPhone = String(c?.phone || (c as any)?.mobile || '').replace(/[^0-9]/g, '');
      const cleanSearch = (searchPhone || '').replace(/[^0-9]/g, '');
      const matchesPhone = !cleanSearch || cPhone.includes(cleanSearch);
      
      let matchesStatus = true;
      if (statusFilter === 'COMPLETED') {
        matchesStatus = c?.status === 'COMPLETED' || c?.status === 'Completed' || c?.status === 'Resolved';
      } else if (statusFilter === 'Pending') {
        matchesStatus = c?.status !== 'COMPLETED' && c?.status !== 'Completed' && c?.status !== 'Resolved';
      } else if (statusFilter !== 'All') {
        matchesStatus = c?.status === statusFilter;
      }

      
      let matchesRole = true;
      if (user?.role === 'technician') {
        matchesRole = c.assignedTechnicianId === user.id;
      } else if (user?.role === 'area_admin') {
        matchesRole = user.pincodes?.includes(c?.pincode) ?? false;
      }

      let matchesPincodeFilter = true;
      if (user?.role === 'super_admin' && pincodeFilter !== 'All') {
        matchesPincodeFilter = c?.pincode === pincodeFilter;
      }
      
      return matchesPhone && matchesStatus && matchesRole && matchesPincodeFilter;
    });
  }, [complaints, searchPhone, statusFilter, user, pincodeFilter]);

  const uniquePincodes = useMemo(() => {
    const pins = new Set<string>();
    complaints?.forEach(c => {
      if (c?.pincode) pins.add(c?.pincode);
    });
    return Array.from(pins)?.sort();
  }, [complaints]);

  const getComplaintWhatsAppNotificationUrl = (c: Complaint) => {
    const rawPhone = String(c?.phone || (c as any)?.mobile || '').replace(/[^0-9]/g, '').slice(-10);
    if (!rawPhone) return '#';
    const customerName = c?.name || 'Customer';
    const jobCard = c?.jobCardId || (c?.id ? String(c.id).substring(0, 8).toUpperCase() : 'TICKET');
    const appliance = c?.product || (c as any)?.device || (c as any)?.appliance || 'Electrical Appliance';
    const status = c?.status || 'Pending';
    const tech = technicians?.find(t => t.id === c.assignedTechnicianId);
    const techName = c.assignedTechnicianName || (c as any)?.assignedTo || tech?.name || 'Assigned Technician';
    const remark = (c as any)?.technicianRemark ? `\n📝 *Technician Note:* ${(c as any).technicianRemark}` : '';

    let message = `*Hello ${customerName},*\n\n`;
    message += `Status update for your repair request with *Sachin Electronics & Repairs*:\n\n`;
    message += `📌 *Job ID:* ${jobCard}\n`;
    message += `🔧 *Appliance:* ${appliance}\n`;
    message += `⚡ *Current Status:* ${status}\n`;
    
    if (status === 'Assigned' || status === 'In Progress') {
      message += `👨‍🔧 *Assigned Technician:* ${techName}\n`;
      message += `⏱️ *Update:* Technician is assigned and attending to your service request.\n`;
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

  return (
    <div className="bg-white/70 backdrop-blur-xl rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/40 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
        <h2 className="text-xl font-bold text-slate-900">
          {user.role === 'super_admin' ? 'Master Global Complaints Center' : 'Local Area Complaints'}
        </h2>
        <p className="text-sm text-slate-500">
          {user.role === 'super_admin' ? 'View and manage all repair tickets across all regions.' : 'Manage tickets for your assigned regions.'}
        </p>
      </div>
      
      <div className="p-6">
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
            <input 
              type="text" 
              placeholder="Search by Phone Number..." 
              value={searchPhone}
              onChange={(e) => setSearchPhone(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white shadow-sm"
            />
          </div>
          <div className="w-full md:w-48">
            <select 
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white shadow-sm appearance-none"
            >
              <option value="All">All Statuses</option>
              <option value="Pending">Pending</option>
              <option value="Assigned">Assigned</option>
              <option value="In Progress">In Progress</option>
              <option value="Customer Not Reachable">Customer Not Reachable</option>
              <option value="Awaiting Part">Awaiting Part</option>
              <option value="COMPLETED">Completed</option>
            </select>
          </div>
          {user.role === 'super_admin' && (
            <div className="w-full md:w-48">
              <select 
                value={pincodeFilter}
                onChange={(e) => setPincodeFilter(e.target.value)}
                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white shadow-sm appearance-none"
              >
                <option value="All">All Regions</option>
                {uniquePincodes?.map(pin => (
                  <option key={pin} value={pin}>{pin} {pin === '209202' ? '(Bilhaur)' : ''}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 bg-white text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th scope="col" className="px-4 py-3.5 text-left font-bold text-slate-900">Ticket ID / Date</th>
                <th scope="col" className="px-4 py-3.5 text-left font-bold text-slate-900">Customer</th>
                <th scope="col" className="px-4 py-3.5 text-left font-bold text-slate-900">Device & Issue</th>
                <th scope="col" className="px-4 py-3.5 text-left font-bold text-slate-900">Status</th>
                <th scope="col" className="px-4 py-3.5 text-left font-bold text-slate-900">Assigned To</th>
                <th scope="col" className="px-4 py-3.5 text-right font-bold text-slate-900">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredComplaints?.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500 font-medium">
                    No complaints match your filters.
                  </td>
                </tr>
              ) : (
                filteredComplaints?.map((complaint: any) => (
                  <tr key={complaint.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-4 py-4 align-top">
                      <div className="font-bold text-slate-900">{complaint.jobCardId || complaint.id?.slice(0, 8)}</div>
                      <div className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                        <Clock className="w-3 h-3"/>
                        {new Date(complaint?.createdAt || Date.now()).toLocaleDateString('en-IN', {
                          day: '2-digit', month: 'short', year: 'numeric',
                          hour: '2-digit', minute: '2-digit'
                        })}
                      </div>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <div className="font-bold text-slate-900">{complaint?.name}</div>
                      <div className="text-slate-600 flex items-center gap-1 mt-0.5"><MapPin className="w-3 h-3"/> {complaint?.address}, {complaint?.pincode}</div>
                      <div className="text-blue-600 font-medium mt-0.5 cursor-pointer hover:underline" onClick={() => handleOpenHistory?.(complaint?.phone)}>{complaint?.phone}</div>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <div className="font-bold text-slate-900">{complaint?.product} {complaint?.device ? `- ${complaint?.device}` : ''}</div>
                      <div className="text-slate-600 line-clamp-2 mt-0.5">{complaint?.issue}</div>
                      {complaint?.preferredTime && <div className="text-xs text-indigo-600 mt-1 font-medium bg-indigo-50 px-2 py-0.5 rounded inline-block">{complaint?.preferredTime}</div>}
                    </td>
                    <td className="px-4 py-4 align-top">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${
                        complaint?.status === 'COMPLETED' ? 'bg-green-100 text-green-800' : 
                        complaint?.status === 'Pending' ? 'bg-red-100 text-red-800' :
                        'bg-blue-100 text-blue-800'
                      }`}>
                        {complaint?.status === 'COMPLETED' && <CheckCircle className="w-3.5 h-3.5"/>}
                        {complaint?.status === 'Pending' && <AlertTriangle className="w-3.5 h-3.5"/>}
                        {complaint?.status}
                      </span>
                    </td>
                    <td className="px-4 py-4 align-top">
                      {user.role === 'super_admin' ? (
                        complaint.assignedAreaAdminId ? (
                          <div className="text-sm font-medium text-slate-900 flex items-center gap-1">
                            <User className="w-3 h-3"/> 
                            {areaAdmins?.find(a => a.id === complaint.assignedAreaAdminId)?.name || 'Assigned Area Admin'}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-500 italic">Unassigned Admin</span>
                        )
                      ) : (
                        complaint.assignedTechnicianId ? (
                          <div className="text-sm font-medium text-slate-900 flex items-center gap-1">
                            <User className="w-3 h-3"/> 
                            {technicians?.find(t => t.id === complaint.assignedTechnicianId)?.name || 'Assigned Tech'}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-500 italic">Unassigned Tech</span>
                        )
                      )}
                    </td>
                    <td className="px-4 py-4 align-top text-right space-y-2">
                       <a
                         href={getComplaintWhatsAppNotificationUrl(complaint)}
                         target="_blank"
                         rel="noopener noreferrer"
                         className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded transition-colors shadow-sm whitespace-nowrap"
                         title="Send quick automated WhatsApp status update to customer"
                       >
                         <MessageCircle className="w-3.5 h-3.5" /> WhatsApp Notification
                       </a>
                       {complaint?.status !== 'COMPLETED' && (
                         <>
                           <button onClick={() => handleUpdateStatus?.(complaint.id)} className="block w-full text-left px-3 py-1.5 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded transition-colors">Update Status</button>
                           {user.role === 'super_admin' && areaAdmins && (
                            <div className="flex flex-col gap-1">
                              <select
                                  id={`admin-select-${complaint.id}`}
                                  defaultValue={complaint.assignedAreaAdminId || ''}
                                  className="w-full text-xs px-2 py-1.5 border border-slate-200 rounded text-slate-700 bg-slate-50 focus:border-indigo-400 outline-none"
                              >
                                  <option value="">Select Area Admin</option>
                                  {areaAdmins?.map(admin => (
                                    <option key={admin.id} value={admin.id}>{admin.name}</option>
                                  ))}
                              </select>
                              <button 
                                onClick={() => {
                                  const selectEl = document.getElementById(`admin-select-${complaint.id}`) as HTMLSelectElement;
                                  if (selectEl && selectEl.value) {
                                    const selectedAdmin = areaAdmins?.find(a => a.id === selectEl.value);
                                    handleAssignAreaAdmin?.(complaint.id, selectEl.value, selectedAdmin?.name || '');
                                  }
                                }}
                                className="w-full px-3 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded transition-colors"
                              >
                                Route to Area Admin
                              </button>
                            </div>
                          )}
                           <button onClick={() => handleOpenResolveModal?.(complaint.id)} className="block w-full text-left px-3 py-1.5 text-xs font-bold text-green-700 bg-green-50 hover:bg-green-100 rounded transition-colors">Mark Resolved</button>
                         </>
                       )}
                       {complaint?.status === 'COMPLETED' && (
                         <>
                           <div className="text-xs text-green-600 font-bold mb-2">Closed</div>
                           <a 
                             href={`https://wa.me/91${complaint?.phone}?text=${encodeURIComponent(`Hello ${complaint?.name},\nYour repair ticket ${complaint.jobCardId || complaint.id} has been successfully completed!\n\n🧾 Total Bill Amount: ₹${complaint?.resolutionDetails?.totalCost || 0}\n🛠️ Service: ${complaint?.issue}\n\nThank you for choosing Sachin Electronics Sales and Service Center!`)}`}
                             target="_blank" rel="noopener noreferrer"
                             className="w-full mt-1 flex justify-center items-center gap-2 bg-green-500 text-white py-1 px-2 rounded font-bold hover:bg-green-600 transition-colors text-[10px]"
                           >
                             💬 Share Invoice
                           </a>
                         </>
                       )}
                       
                       <button
                         onClick={() => handleDeleteComplaint?.(complaint.id)}
                         className="mt-2 w-full flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-bold text-red-700 bg-red-50 hover:bg-red-100 rounded transition-colors"
                       >
                         <Trash2 className="w-3 h-3" /> Delete
                       </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
