import React, { useState, useEffect } from 'react';
import { useGlobalState } from "../context/GlobalContext";
import ErrorBoundary from "./ErrorBoundary";
import { db, complaintsCollection, techniciansCollection, inventoryCollection, leavesCollection, attendanceCollection } from '../lib/firebase';
import { onSnapshot, updateDoc, doc, getDocs, setDoc, getDoc } from 'firebase/firestore';

import { Complaint, Technician, InventoryItem } from '../types';
import { LogOut, Check, Camera, Wrench, Search, Package, FileText, Download, MapPin, MessageCircle, ScanLine, Clock, PlayCircle, Square, Briefcase, Calendar } from 'lucide-react';
import { secureStorage } from '../lib/security';
import { generateInvoice } from '../utils/generateInvoice';
import VoiceInput from './VoiceInput';
import InvoiceGeneratorModal from './InvoiceGeneratorModal';
import { FileText as FileTextIcon } from 'lucide-react';
import DOMPurify from 'dompurify';
import QRCode from 'react-qr-code';
import BarcodeScanner from './BarcodeScanner';

function safeJSONParse(val: string | null, fallback: any) {
  if (!val) return fallback;
  try {
    return JSON.parse(val) || fallback;
  } catch (e) {
    return fallback;
  }
}


function InnerTechnicianDashboard() {
  const { complaints, setComplaints, technicians, setTechnicians, areaAdmins, setAreaAdmins } = useGlobalState();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [tech, setTech] = useState<Technician | null>(null);
  
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [activeTab, setActiveTab] = useState<'tasks' | 'inventory' | 'attendance'>('tasks');
  const [taskFilter, setTaskFilter] = useState<'Active' | 'COMPLETED' | 'All'>('Active');
  const [inventorySearch, setInventorySearch] = useState('');

  // Resolution State
  const [resolutionModalOpen, setResolutionModalOpen] = useState(false);
  const [resolvingComplaintId, setResolvingComplaintId] = useState<string | null>(null);
  
  // Remark State
  const [remarkModalOpen, setRemarkModalOpen] = useState(false);
  const [remarkingComplaintId, setRemarkingComplaintId] = useState<string | null>(null);
  const [technicianRemark, setTechnicianRemark] = useState('');
  const [remarkStatus, setRemarkStatus] = useState('Pending - Part Required');
  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false);
  const [selectedInvoiceComplaint, setSelectedInvoiceComplaint] = useState<any>(null);
  const [replacedPartName, setReplacedPartName] = useState('');
  const [isListeningPart, setIsListeningPart] = useState(false);
  const [serialNumber, setSerialNumber] = useState('');
  const [showScanner, setShowScanner] = useState(false);
  const [oldPartPhoto, setOldPartPhoto] = useState('');
  const [newPartPhoto, setNewPartPhoto] = useState('');
  const [oldPartLocation, setOldPartLocation] = useState('');
  const [newPartLocation, setNewPartLocation] = useState('');
  const [totalCost, setTotalCost] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<'Paid' | 'Pending'>('Paid');
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'Online / UPI / QR'>('Cash');
  const [utrNumber, setUtrNumber] = useState('');
  const [paymentScreenshotUrl, setPaymentScreenshotUrl] = useState('');

  
  // Shift Tracker State
    // Attendance State
  const [attendance, setAttendance] = useState<any[]>([]);
  const [currentMonthDays, setCurrentMonthDays] = useState<Date[]>([]);
  const [showSelfieCamera, setShowSelfieCamera] = useState(false);
  const [selfieProcessing, setSelfieProcessing] = useState(false);
  const [leaves, setLeaves] = useState<any[]>([]);

  useEffect(() => {
    const today = new Date();
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const days = Array.from({ length: daysInMonth }, (_, i) => new Date(today.getFullYear(), today.getMonth(), i + 1));
    setCurrentMonthDays(days);
    
    if (tech) {
      const unsubAtt = onSnapshot(attendanceCollection, (snapshot) => {
        if (!snapshot.empty) {
          const allAttendance = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          setAttendance(allAttendance.filter((a: any) => a.techId === tech.id));
        } else {
          setAttendance([]);
        }
      }, (err) => console.warn('Attendance sync note:', err));

      const unsubLeaves = onSnapshot(leavesCollection, (snapshot) => {
        if (!snapshot.empty) {
          const allLeaves = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          setLeaves(allLeaves.filter((l: any) => l.techId === tech.id));
        } else {
          setLeaves([]);
        }
      }, (err) => console.warn('Leaves sync note:', err));
      
      // Cloud Firestore listener for technician's assigned tasks
      const unsubFsComp = onSnapshot(complaintsCollection, (snapshot) => {
        if (!snapshot.empty) {
          const fsData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
          const myTasks = fsData.filter((c: any) => c.assignedTechnicianId === tech.id);
          setComplaints(prev => {
            const merged = [...myTasks, ...prev.filter(p => !myTasks.some(m => m.id === p.id))];
            return merged.sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
          });
        }
      }, (err) => console.warn('Complaints sync note:', err));
      
      const unsubInv = onSnapshot(inventoryCollection, (snapshot) => {
        if (!snapshot.empty) {
          const val = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as InventoryItem[];
          setInventory(val);
        } else {
          setInventory([]);
        }
      }, (err) => console.warn('Inventory sync note:', err));

      return () => {
        unsubAtt();
        unsubLeaves();
        unsubFsComp();
        unsubInv();
      };
    }
  }, [tech]);

  const handleCaptureSelfie = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !tech) return;
    
    setSelfieProcessing(true);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 400;
        const scaleSize = MAX_WIDTH / img.width;
        canvas.width = MAX_WIDTH;
        canvas.height = img.height * scaleSize;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.5); // Compress < 30KB
        
        // Save Check-In
        const todayStr = new Date().toLocaleString('en-CA', {timeZone: 'Asia/Kolkata'}).split(',')[0];
        
        if (attendance.find((a: any) => a.date === todayStr)) {
          alert('Already checked in today!');
        } else {
          const newRecord = {
            id: 'att_' + Date.now(),
            techId: tech?.id,
            techName: tech?.name,
            date: todayStr,
            status: 'Present',
            photoUrl: dataUrl,
            timestamp: new Date().toISOString()
          };
          setDoc(doc(db, 'attendance', newRecord.id), newRecord).then(() => {
            alert('Check-in successful!');
          }).catch(err => {
            console.error('Error recording check-in:', err);
            alert('Failed to record check-in.');
          });
        }
        setShowSelfieCamera(false);
        setSelfieProcessing(false);
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
  };
  
  const handleApplyLeave = () => {
     if (!tech) return;
     const todayStr = new Date().toLocaleString('en-CA', {timeZone: 'Asia/Kolkata'}).split(',')[0];
     const dateStr = prompt("Enter leave date (YYYY-MM-DD):", todayStr);
     if (!dateStr) return;
     const reason = prompt("Reason for leave:");
     
     const newLeave = {
        id: 'lv_' + Date.now(),
        techId: tech?.id,
        techName: tech?.name,
        date: dateStr,
        reason: reason || 'Personal',
        status: 'Pending',
        timestamp: new Date().toISOString()
     };
     setDoc(doc(db, 'leaves', newLeave.id), newLeave).then(() => {
        alert("Leave request submitted to Admin.");
     }).catch(err => {
        console.error("Error submitting leave request:", err);
        alert("Failed to submit leave request.");
     });
  };
  const [isOnShift, setIsOnShift] = useState(false);
  const [shiftStartTime, setShiftStartTime] = useState<number | null>(null);
  const [shiftDuration, setShiftDuration] = useState(0); // in seconds
  
  useEffect(() => {
    if (tech) {
      // First check local storage
      const shiftData = secureStorage.getItem(`shift_${tech?.id}`);
      if (shiftData && shiftData.isOnShift) {
        const now = Date.now();
        if (now - shiftData.startTime > 24 * 60 * 60 * 1000) {
           setIsOnShift(false);
           setShiftStartTime(null);
           secureStorage.setItem(`shift_${tech?.id}`, { isOnShift: false, startTime: null });
        } else {
           setIsOnShift(true);
           setShiftStartTime(shiftData.startTime);
        }
      }

      // Also sync from Firebase attendance document
      try {
        getDoc(doc(db, 'attendance', tech.id)).then((snapshot) => {
          if (snapshot.exists()) {
            const data = snapshot.data();
            if (data.isOnShift && data.shiftStartTimeMs) {
              const now = Date.now();
              if (now - data.shiftStartTimeMs < 24 * 60 * 60 * 1000) {
                setIsOnShift(true);
                setShiftStartTime(data.shiftStartTimeMs);
                secureStorage.setItem(`shift_${tech?.id}`, { isOnShift: true, startTime: data.shiftStartTimeMs });
              }
            }
          }
        }).catch(err => {
          console.error("Attendance fetch error:", err);
        });
      } catch (e) {
        console.error("Attendance init error:", e);
      }
    }
  }, [tech]);

  useEffect(() => {
    let interval: any;
    if (isOnShift && shiftStartTime) {
      interval = setInterval(() => {
        setShiftDuration(Math.floor((Date.now() - shiftStartTime) / 1000));
      }, 1000);
    } else {
      setShiftDuration(0);
    }
    return () => clearInterval(interval);
  }, [isOnShift, shiftStartTime]);

  const handleToggleShift = async () => {
    if (!tech) return;
    
    if (isOnShift) {
      // Check out
      if (window.confirm("Are you sure you want to end your shift?")) {
        const endIso = new Date().toISOString();
        const duration = shiftDuration;
        setIsOnShift(false);
        setShiftStartTime(null);
        secureStorage.setItem(`shift_${tech?.id}`, { isOnShift: false, startTime: null });

        // Safely log End Shift to Firebase Firestore
        try {
          await setDoc(doc(db, 'attendance', tech.id), {
            status: 'Off Shift',
            isOnShift: false,
            lastShiftEnd: endIso,
            lastShiftDurationSec: duration,
            updatedAt: endIso
          }, { merge: true });
        } catch (err) {
          console.error('Error logging End Shift to Firebase:', err);
        }
      }
    } else {
      // Check in
      const now = Date.now();
      const nowIso = new Date().toISOString();
      const todayDate = new Date().toLocaleDateString('en-CA');
      setIsOnShift(true);
      setShiftStartTime(now);
      secureStorage.setItem(`shift_${tech?.id}`, { isOnShift: true, startTime: now });

      // Safely log Start Shift to Firebase Firestore
      try {
        await setDoc(doc(db, 'attendance', tech.id), {
          techId: tech.id,
          techName: tech.name,
          techPhone: tech.phone || tech.mobile || '',
          status: 'On Shift',
          isOnShift: true,
          lastShiftStart: nowIso,
          shiftStartTimeMs: now,
          date: todayDate,
          updatedAt: nowIso
        }, { merge: true });
      } catch (err) {
        console.error('Error logging Start Shift to Firebase:', err);
      }
    }
  };

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };
  
  const jobsCompletedToday = complaints?.filter(c => c?.status === 'COMPLETED' && new Date(c.resolutionDetails?.resolutionDate || c.createdAt).toDateString() === new Date().toDateString())?.length;
  const estimatedEarnings = jobsCompletedToday * 150; // assuming 150 INR base payout per job for dummy stats

  // History Modal State
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [historyPhone, setHistoryPhone] = useState('');
  const [customerHistory, setCustomerHistory] = useState<Complaint[]>([]);

  useEffect(() => {
    const storedTech = localStorage.getItem('current_tech');
    if (storedTech) {
      const techData = JSON.parse(storedTech);
      setTech(techData);
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setLoginError('');
    try {
      const snap = await getDocs(techniciansCollection);
      let allTechs: any[] = [];
      if (!snap.empty) {
        allTechs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      }
      const cleanPhone = phone.trim();
      const cleanPassword = password.trim();
      const foundTech = allTechs.find((t: any) => 
        (t.phone === cleanPhone || t.loginId === cleanPhone || t.mobile === cleanPhone) && 
        t.password === cleanPassword
      );

      if (!foundTech) {
        setLoginError('Invalid credentials. Please verify your registered mobile number and password.');
      } else if (foundTech.isActive === false) {
        setLoginError('Account inactive. Contact Admin.');
      } else {
        setTech(foundTech);
        localStorage.setItem('current_tech', JSON.stringify(foundTech));
      }
    } catch (error: any) {
      console.error('Technician login error:', error);
      setLoginError('Error logging in: ' + (error?.message || 'Check connection'));
    }
    setLoading(false);
  };

  const handleLogout = () => {
    localStorage.removeItem('current_tech');
    localStorage.removeItem('techId'); // fallback
    setTech(null);
    setPhone('');
    setPassword('');
  };

  const handleSaveRemark = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!remarkingComplaintId) return;

    try {
      const remarkData = {
        technicianRemark: technicianRemark,
        status: remarkStatus,
        updatedAt: new Date().toISOString()
      };
      await updateDoc(doc(db, 'complaints', remarkingComplaintId), remarkData);
      setRemarkModalOpen(false);
      setRemarkingComplaintId(null);
      setTechnicianRemark('');
      setRemarkStatus('Pending - Part Required');
      alert('Remark saved successfully!');
    } catch (error: any) {
      console.error('Error saving remark:', error);
      alert('Failed to save remark. Please try again.');
    }
  };

  const handleResolveComplaint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolvingComplaintId) return;

    try {
      const sanitizedPartName = DOMPurify.sanitize(replacedPartName);
      const resolveData = {
        status: 'COMPLETED',
        resolutionDetails: {
          replacedPartName: sanitizedPartName,
          serialNumber: DOMPurify.sanitize(serialNumber),
          oldPartPhoto,
          newPartPhoto,
          oldPartLocation,
          newPartLocation,
          totalCost: Number(DOMPurify.sanitize(totalCost.toString())),
          resolutionDate: new Date().toISOString(),
          paymentStatus: paymentStatus,
          paymentMethod: paymentMethod,
          ...(paymentMethod === 'Online / UPI / QR' && {
            utrNumber: DOMPurify.sanitize(utrNumber),
            paymentScreenshotUrl
          })
        },
        updatedAt: new Date().toISOString()
      };

      await updateDoc(doc(db, 'complaints', resolvingComplaintId), resolveData);
      
      setResolutionModalOpen(false);
      setResolvingComplaintId(null);
      setReplacedPartName('');
      setSerialNumber('');
      setOldPartPhoto('');
      setNewPartPhoto('');
      setOldPartLocation('');
      setNewPartLocation('');
      setTotalCost('');
      setPaymentStatus('Paid');
      setPaymentMethod('Cash');
      setUtrNumber('');
      setPaymentScreenshotUrl('');
      alert('Job marked as completed successfully!');
      setUtrNumber('');
      setPaymentScreenshotUrl('');
      
      
      // Update local storage directly to persist completed
      const localComplaints = safeJSONParse(localStorage.getItem('app_complaints'), JSON.parse('[]'));
      const compIndex = localComplaints?.findIndex((c: any) => c.id === resolvingComplaintId);
      if (compIndex >= 0) {
        localComplaints[compIndex].status = 'COMPLETED';
        localComplaints[compIndex].resolutionDetails = {
          totalCost: Number(totalCost),
          resolutionDate: new Date().toISOString()
        };
        
      }
      
      if (tech && tech?.id) {
        
      }
    } catch (error) {
      console.error("Error resolving complaint:", error);
      alert("Error saving resolution details.");
    }
  };

  const handlePhotoUpload = async (
    e: React.ChangeEvent<HTMLInputElement>, 
    setPhotoState: React.Dispatch<React.SetStateAction<string>>,
    setLocationState: React.Dispatch<React.SetStateAction<string>>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    let locationText = "Location Not Available";

    if ('geolocation' in navigator) {
      try {
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 });
        });
        
        try {
          const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${position.coords.latitude}&lon=${position.coords.longitude}&zoom=18&addressdetails=1`);
          if (response.ok) {
            const data = await response.json();
            locationText = data.display_name || `${position.coords.latitude.toFixed(5)}, ${position.coords.longitude.toFixed(5)}`;
          } else {
             locationText = `Lat: ${position.coords.latitude.toFixed(5)}, Lng: ${position.coords.longitude.toFixed(5)}`;
          }
        } catch (err) {
           locationText = `Lat: ${position.coords.latitude.toFixed(5)}, Lng: ${position.coords.longitude.toFixed(5)}`;
        }
      } catch (err) {
        console.error("Location error:", err?.message || String(err));
      }
    }

    setLocationState(locationText);
    const timestampText = new Date().toLocaleString();

    const reader = new FileReader();
    reader.onloadend = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800;
        const MAX_HEIGHT = 800;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, width, height);

        const padding = 10;
        const fontSize = Math.max(14, Math.floor(width * 0.03));
        ctx.font = `${fontSize}px sans-serif`;
        
        const texts = [timestampText, locationText];
        const boxHeight = (fontSize * 1.5) * texts?.length + padding * 2;
        
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(0, height - boxHeight, width, boxHeight);
        
        ctx.fillStyle = 'white';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        
        texts?.forEach((text, i) => {
          let displayText = text;
          if (ctx.measureText(displayText).width > width - padding * 2) {
             while (displayText?.length > 0 && ctx.measureText(displayText + '...').width > width - padding * 2) {
               displayText = displayText.substring(0, displayText?.length - 1);
             }
             displayText += '...';
          }
          ctx.fillText(displayText, padding, height - boxHeight + padding + i * (fontSize * 1.5));
        });

        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        setPhotoState(dataUrl);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleShareWhatsAppReminder = (complaint: Complaint) => {
    const upiString = `upi://pay?pa=sachinelectricals@upi&pn=Sachin%20Electricals&am=${complaint?.resolutionDetails?.totalCost}&cu=INR`;
    const message = `Hello ${complaint?.name},\n\nThis is a gentle reminder from Sachin Electricals regarding your pending payment.\n\nService Summary:\nProduct: ${complaint?.product}\nIssue: ${complaint?.issue}\n\nPending Amount: Rs. ${complaint?.resolutionDetails?.totalCost || 0}\n\nYou can pay online using the UPI link below:\n${upiString}\n\nThank you!`;
    const url = `https://wa.me/91${complaint?.phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  };

  const handleViewHistory = async (phone: string) => {
    try {
      const snapshot = await getDocs(complaintsCollection);
      if (!snapshot.empty) {
        const allComplaints = snapshot.docs.map(k => ({ id: k.id, ...k.data() })) as Complaint[];
        const cleanTarget = phone.replace(/[^0-9]/g, '').slice(-10);
        const userHistory = allComplaints.filter(c => {
          const cPhone = (c.phone || (c as any).mobile || '').replace(/[^0-9]/g, '').slice(-10);
          return cPhone && cPhone === cleanTarget;
        });
        userHistory.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setCustomerHistory(userHistory);
      } else {
        setCustomerHistory([]);
      }

      setHistoryPhone(phone);
      setHistoryModalOpen(true);
    } catch (error) {
      console.error("Error fetching history from Firestore:", error);
      alert("Failed to load customer history.");
    }
  };

  const handleShareWhatsApp = (complaint: Complaint) => {
    const message = `Hello ${complaint?.name},\n\nThank you for choosing Sachin Electricals.\n\nHere is your service summary:\nProduct: ${complaint?.product}\nIssue: ${complaint?.issue}\nReplaced Parts: ${complaint?.resolutionDetails?.replacedPartName || 'None'}\n\nTotal Amount: Rs. ${complaint?.resolutionDetails?.totalCost || 0}\n\nWe appreciate your business!`;
    const url = `https://wa.me/91${complaint?.phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  };

  if (!tech) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">

      <div className="w-full bg-slate-900 text-white px-6 py-4 flex justify-between items-center shadow-md z-50">
        <div className="font-bold text-lg tracking-tight">Sachin Electricals</div>
        <button 
          onClick={() => {
            localStorage.clear();
            window.location.hash = '';
            window.location.reload();
          }}
          className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-bold text-sm transition-colors"
        >
          <span>Exit / Switch Role</span>
        </button>
      </div>
    
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="flex justify-center mb-6">
            <div className="bg-blue-600 p-3 rounded-xl">
              <Wrench className="h-8 w-8 text-white" />
            </div>
          </div>
          <h2 className="text-center text-3xl font-extrabold text-slate-900">Technician Login</h2>
          <p className="mt-2 text-center text-sm text-slate-600">
            Sign in to view your assigned tasks
          </p>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
            <form className="space-y-6" onSubmit={handleLogin}>
              <div>
                <label className="block text-sm font-medium text-slate-700">Mobile Number</label>
                <div className="mt-1">
                  <input type="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} className="appearance-none block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" placeholder="Your registered mobile number" />
                </div>
              </div>
              <div>
                <div className="mt-1 flex justify-between items-center">
                  <label className="block text-sm font-medium text-slate-700">Password</label>
                  <button type="button" onClick={() => alert("Reset request sent to Admin. Contact Admin to clear/reset password.")} className="text-sm font-medium text-blue-600 hover:text-blue-500">
                    Forgot Password?
                  </button>
                </div>
                <div className="mt-1">
                  <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="appearance-none block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" />
                </div>
              </div>

              {loginError && <p className="text-red-500 text-sm font-medium">{loginError}</p>}

              <div>
                <button type="submit" disabled={loading} className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-70">
                  {loading ? 'Signing in...' : 'Sign in'}
                </button>
              </div>
            </form>
            <div className="mt-6 border-t border-slate-200 pt-6 text-center">
                <a href="#" onClick={() => { window.location.hash = ''; window.location.reload(); }} className="text-sm font-medium text-slate-600 hover:text-slate-900">
                    &larr; Back to Home
                </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center gap-4">
              <div className="bg-blue-100 p-2 rounded-lg">
                <Wrench className="h-6 w-6 text-blue-600" />
              </div>
              <h1 className="text-xl font-bold text-slate-900">Hi, {tech?.name}</h1>
            </div>
            <div className="flex items-center gap-4">
              <button onClick={handleLogout} className="flex items-center gap-2 text-slate-600 hover:text-slate-900 font-medium bg-slate-100 px-3 py-2 rounded-md transition-colors">
                <LogOut className="h-4 w-4" /> <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div className="bg-white border-b border-slate-200 sticky top-16 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex gap-4">
            <button
              onClick={() => setActiveTab('tasks')}
              className={`py-4 px-2 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'tasks' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              Assigned Tasks
            </button>
            <button
              onClick={() => setActiveTab('inventory')}
              className={`py-4 px-2 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'inventory' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              Parts Inventory
            </button>
            <button
              onClick={() => setActiveTab('attendance')}
              className={`py-4 px-2 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'attendance' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              Attendance & Salary
            </button>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">

        {/* Shift & Attendance Widget */}
        <div className="mb-8 bg-white/70 backdrop-blur-xl rounded-2xl shadow-sm border border-slate-200/60 p-5 lg:p-6 overflow-hidden relative">
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-blue-400/10 to-purple-400/10 rounded-full blur-3xl -z-10 translate-x-1/2 -translate-y-1/2"></div>
          
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-5 w-full md:w-auto">
              <div className="relative">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${isOnShift ? 'bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-emerald-500/30' : 'bg-gradient-to-br from-slate-200 to-slate-300'} shadow-lg text-white transition-all duration-300`}>
                  <Clock className="w-7 h-7" />
                </div>
                {isOnShift && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-400 border-2 border-white rounded-full animate-pulse"></span>
                )}
              </div>
              
              <div>
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  Shift Status
                  <span className={`text-xs px-2 py-0.5 rounded-full font-bold uppercase ${isOnShift ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                    {isOnShift ? 'Active' : 'Offline'}
                  </span>
                </h3>
                {isOnShift ? (
                  <div className="text-emerald-600 font-mono font-bold text-xl tracking-wider mt-1">{formatDuration(shiftDuration)}</div>
                ) : (
                  <div className="text-slate-500 text-sm mt-1">Ready for work? Check in below.</div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end">
              <div className="hidden sm:flex gap-4 mr-4">
                <div className="bg-slate-50 border border-slate-100 px-4 py-2 rounded-xl text-center">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Jobs Today</p>
                  <p className="text-lg font-bold text-slate-700 flex items-center justify-center gap-1"><Briefcase className="w-4 h-4 text-blue-500" /> {jobsCompletedToday}</p>
                </div>
                <div className="bg-slate-50 border border-slate-100 px-4 py-2 rounded-xl text-center">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Est. Earnings</p>
                  <p className="text-lg font-bold text-emerald-600">₹{estimatedEarnings}</p>
                </div>
              </div>

              <button
                onClick={handleToggleShift}
                className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold text-white transition-all duration-300 shadow-lg ${
                  isOnShift 
                    ? 'bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 shadow-red-500/25' 
                    : 'bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 shadow-emerald-500/25'
                }`}
              >
                {isOnShift ? (
                  <><Square className="w-5 h-5 fill-current" /> End Shift</>
                ) : (
                  <><PlayCircle className="w-5 h-5" /> Start Shift</>
                )}
              </button>
            </div>
          </div>
        </div>

        
        {activeTab === 'attendance' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2"><Calendar className="w-6 h-6 text-blue-600" /> Monthly Attendance</h2>
              <div className="flex gap-2">
                <button 
                  onClick={handleApplyLeave}
                  className="px-4 py-2 bg-yellow-100 text-yellow-800 font-bold rounded-xl hover:bg-yellow-200 transition-colors shadow-sm text-sm"
                >
                  Apply Leave
                </button>
                <label className="px-4 py-2 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors shadow-sm text-sm cursor-pointer inline-flex items-center gap-2">
                  <Camera className="w-4 h-4" /> Daily Check-In
                  <input type="file" accept="image/*" capture="user" className="hidden" onChange={handleCaptureSelfie} disabled={selfieProcessing} />
                </label>
              </div>
            </div>
            
            {selfieProcessing && <p className="text-blue-600 font-bold text-center">Processing check-in selfie...</p>}

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <h3 className="font-bold text-lg mb-4">{new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}</h3>
              
              <div className="grid grid-cols-7 gap-2 mb-4">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']?.map(day => (
                  <div key={day} className="text-center text-xs font-bold text-slate-400 uppercase">{day}</div>
                ))}
                
                {Array.from({ length: currentMonthDays[0].getDay() })?.map((_, i) => (
                  <div key={'empty-'+i} className="aspect-square"></div>
                ))}
                
                {currentMonthDays?.map(date => {
                  const dateStr = date.toLocaleString('en-CA', {timeZone: 'Asia/Kolkata'}).split(',')[0];
                  const att = attendance?.find(a => a.date === dateStr);
                  const lv = leaves?.find(l => l.date === dateStr);
                  
                  let bgClass = "bg-slate-50 border-slate-100";
                  let label = "-";
                  let textClass = "text-slate-400";
                  
                  if (att && att.status === 'Present') {
                    bgClass = "bg-green-100 border-green-200";
                    label = "✔";
                    textClass = "text-green-700 font-bold";
                  } else if (lv && lv.status === 'Approved') {
                    bgClass = "bg-yellow-100 border-yellow-200";
                    label = "L";
                    textClass = "text-yellow-700 font-bold";
                  } else if (lv && lv.status === 'Pending') {
                    bgClass = "bg-orange-50 border-orange-100";
                    label = "?";
                    textClass = "text-orange-400";
                  } else if (date < new Date()) {
                    bgClass = "bg-red-50 border-red-100";
                    label = "A";
                    textClass = "text-red-500 font-bold";
                  }
                  
                  // Highlight today
                  const isToday = dateStr === new Date().toLocaleString('en-CA', {timeZone: 'Asia/Kolkata'}).split(',')[0];
                  if (isToday) {
                    bgClass += " ring-2 ring-blue-400 ring-offset-1";
                  }
                  
                  return (
                    <div key={dateStr} className={`aspect-square rounded-lg border flex flex-col items-center justify-center p-1 ${bgClass}`}>
                      <span className="text-xs font-medium text-slate-700 mb-1">{date.getDate()}</span>
                      <span className={`text-sm ${textClass}`}>{label}</span>
                    </div>
                  );
                })}
              </div>
              
              <div className="flex gap-4 mt-6 text-sm font-medium border-t pt-4 border-slate-100">
                 <div className="flex items-center gap-2"><div className="w-3 h-3 bg-green-100 border border-green-200 rounded-full"></div> Present ({attendance?.length})</div>
                 <div className="flex items-center gap-2"><div className="w-3 h-3 bg-yellow-100 border border-yellow-200 rounded-full"></div> Approved Leave</div>
                 <div className="flex items-center gap-2"><div className="w-3 h-3 bg-red-50 border border-red-100 rounded-full"></div> Absent</div>
              </div>
            </div>
            
            {tech.baseSalary && (
              <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-2xl shadow-lg p-6 text-white mt-6">
                <h3 className="font-bold text-lg mb-4 text-blue-200">Current Month Payroll Estimate</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Base Salary</p>
                    <p className="font-bold text-xl">₹{tech.baseSalary}</p>
                  </div>
                  <div>
                    <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Days in Month</p>
                    <p className="font-bold text-xl">{currentMonthDays?.length}</p>
                  </div>
                  <div>
                    <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Present Days</p>
                    <p className="font-bold text-xl text-green-400">{attendance?.length}</p>
                  </div>
                  <div>
                    <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Est. Payout</p>
                    <p className="font-bold text-xl text-yellow-400">₹{Math.round((tech.baseSalary / currentMonthDays?.length) * attendance?.length)}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}


        {activeTab === 'tasks' && (
          <>
            <div className="mb-6 flex justify-between items-center">
                <h2 className="text-2xl font-bold text-slate-900">Assigned Tasks ({complaints?.length})</h2>
            </div>

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {complaints?.map(complaint => (
                <div key={complaint.id} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                  <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-start bg-slate-50">
                    <div>
                      <h3 className="font-bold text-slate-900">{complaint?.product}</h3>
                      <p className="text-sm text-slate-500">{new Date(complaint?.createdAt).toLocaleString()}</p>
                    </div>
                    <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${
                      complaint?.status === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                      complaint?.status === 'Pending' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-blue-100 text-blue-700'
                    }`}>
                      {complaint?.status}
                    </span>
                  </div>
                  
                  <div className="p-6 flex-1 flex flex-col gap-4">
                    <div>
                      <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-1">Customer Details</p>
                      <p className="font-medium text-slate-900">{complaint?.customerName || complaint?.name}</p>
                      <p className="text-sm text-slate-700">{complaint?.phone || complaint?.mobile}</p>
                      <div className="flex items-start justify-between mt-1">
                        <p className="text-sm text-slate-700 flex-1">{complaint?.address}{complaint?.pincode && <span>, <br/><span className="font-bold text-slate-900">{complaint?.pincode}</span></span>}</p>
                        <a 
                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(complaint?.address)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800 ml-2 bg-blue-50 p-1.5 rounded-md"
                          title="Get Directions"
                        >
                          <MapPin className="w-5 h-5" />
                        </a>
                      </div>
                      <button onClick={() => handleViewHistory(complaint?.phone)} className="text-xs text-blue-600 font-bold hover:underline mt-2">
                        View Service History
                      </button>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      {complaint.priority && (
                        <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                           <p className="text-[10px] text-slate-500 uppercase font-bold">Priority</p>
                           <p className={`text-xs font-bold ${complaint.priority === 'Urgent' ? 'text-red-600' : 'text-slate-700'}`}>{complaint.priority}</p>
                        </div>
                      )}
                      {complaint.timeslot && (
                        <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                           <p className="text-[10px] text-slate-500 uppercase font-bold">Timeslot</p>
                           <p className="text-xs font-bold text-slate-700">{complaint.timeslot}</p>
                        </div>
                      )}
                    </div>
                    
                    <div>
                      <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-1">Issue</p>
                      <p className="text-sm text-slate-800 bg-slate-50 p-3 rounded-lg border border-slate-100">{complaint?.issue}</p>
                      {complaint?.issueImageUrl && (
                        <div className="mt-2">
                          <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-1">Attached Photo</p>
                          <a href={complaint?.issueImageUrl} target="_blank" rel="noopener noreferrer">
                            <img src={complaint?.issueImageUrl} alt="Issue" className="w-full h-32 object-cover rounded-lg border border-slate-200 hover:opacity-90 transition-opacity" />
                          </a>
                        </div>
                      )}
                    </div>
                    
                    {complaint?.technicianAlert && (
                      <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                        <p className="text-xs text-blue-800 uppercase tracking-wider font-bold mb-1 flex items-center gap-1.5">
                          <Wrench className="w-3.5 h-3.5 text-blue-600" />
                          Area Admin Alert ({complaint.technicianAlert.alertStatus || 'Assigned'})
                        </p>
                        <p className="text-xs text-blue-900 font-medium">
                          Dispatched by: <span className="font-bold">{complaint.technicianAlert.areaAdminName || 'Area Admin'}</span>
                        </p>
                        {complaint.technicianAlert.note && (
                          <p className="text-xs text-blue-800 mt-1 italic bg-white/70 p-2 rounded border border-blue-100">
                            "{complaint.technicianAlert.note}"
                          </p>
                        )}
                      </div>
                    )}

                    {complaint?.technicianRemark && (
                      <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-100">
                        <p className="text-xs text-yellow-800 uppercase tracking-wider font-semibold mb-1 flex items-center gap-1">
                          <MessageCircle className="w-3 h-3" /> Technician Remark
                        </p>
                        <p className="text-sm text-yellow-900">{complaint.technicianRemark}</p>
                      </div>
                    )}

                    {complaint?.status === 'COMPLETED' && complaint?.resolutionDetails && (
                      <div className="mt-auto flex flex-col gap-3">
                        <div className="bg-green-50 p-3 rounded-lg border border-green-100">
                          <p className="text-xs font-bold text-green-800 mb-1">Resolved Successfully</p>
                          <p className="text-sm text-green-700">Replaced: {complaint?.resolutionDetails.replacedPartName}</p>
                          <div className="flex items-center gap-3 mt-1">
                            <p className="text-sm text-green-700 font-bold">Cost: ₹{complaint?.resolutionDetails.totalCost}</p>
                            {complaint?.resolutionDetails.paymentStatus === 'Pending' ? (
                              <span className="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded-full font-bold uppercase tracking-wide">
                                Payment Pending
                              </span>
                            ) : (
                              <span className="bg-green-200 text-green-800 text-xs px-2 py-0.5 rounded-full font-bold uppercase tracking-wide flex items-center gap-1">
                                <Check className="w-3 h-3" /> Paid {complaint?.resolutionDetails.paymentMethod === 'Cash' ? 'Cash' : 'Online'}
                              </span>
                            )}
                          </div>
                      <a 
                        href={`https://wa.me/91${complaint?.mobile}?text=${encodeURIComponent(`Hello ${complaint?.name},\nYour repair ticket ${complaint.jobCardId || complaint.id} has been successfully completed!\n\n🧾 Total Bill Amount: ₹${complaint?.resolutionDetails?.totalCost || 0}\n🛠️ Service: ${complaint?.issue}\n\nThank you for choosing Sachin Electronics Sales and Service Center!`)}`}
                        target="_blank" rel="noopener noreferrer"
                        className="w-full mt-4 flex justify-center items-center gap-2 bg-green-500 text-white py-2 px-4 rounded-lg font-bold hover:bg-green-600 transition-colors"
                      >
                        💬 Share Invoice on WhatsApp
                      </a>

                          
                          {complaint?.resolutionDetails.paymentMethod === 'Online / UPI / QR' && (
                            <div className="mt-3 pt-3 border-t border-green-200/60 flex items-start justify-between">
                              <div>
                                <p className="text-[10px] text-green-800 uppercase font-bold opacity-80 mb-0.5">UTR / Txn ID</p>
                                <p className="text-xs text-green-900 font-medium font-mono">{complaint?.resolutionDetails.utrNumber || 'N/A'}</p>
                              </div>
                              {complaint?.resolutionDetails.paymentScreenshotUrl && (
                                <a href={complaint?.resolutionDetails.paymentScreenshotUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 ml-3">
                                  <img src={complaint?.resolutionDetails.paymentScreenshotUrl} alt="Payment" className="w-10 h-10 object-cover rounded-md border border-green-300 shadow-sm hover:scale-105 transition-transform" />
                                </a>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2">
                          {complaint?.resolutionDetails.paymentStatus === 'Pending' && (
                            <button 
                              onClick={() => handleShareWhatsAppReminder(complaint)}
                              className="flex-1 flex justify-center items-center gap-2 bg-yellow-500 text-white py-2 rounded-lg font-bold hover:bg-yellow-600 transition-colors text-sm"
                            >
                              <MessageCircle className="w-4 h-4" /> Send Reminder
                            </button>
                          )}
                          <button 
                            onClick={() => generateInvoice(complaint)}
                            className="flex-1 flex justify-center items-center gap-2 bg-white border border-green-200 text-green-700 py-2 rounded-lg font-bold hover:bg-green-50 transition-colors text-sm"
                          >
                            <FileText className="w-4 h-4" /> Invoice
                          </button>
                          <button 
                            onClick={() => handleShareWhatsApp(complaint)}
                            className="flex-1 flex justify-center items-center gap-2 bg-green-500 text-white py-2 rounded-lg font-bold hover:bg-green-600 transition-colors text-sm"
                          >
                            <MessageCircle className="w-4 h-4" /> WhatsApp
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {complaint?.status !== 'COMPLETED' && (
                    <div className="p-4 border-t border-slate-100 bg-slate-50 flex gap-3">
                      <button 
                        onClick={() => {
                          if (complaint.id) {
                            setResolvingComplaintId(complaint.id);
                            setResolutionModalOpen(true);
                          }
                        }}
                        className="flex-1 flex justify-center items-center gap-2 bg-blue-600 text-white py-2.5 px-4 rounded-lg font-bold hover:bg-blue-700 transition-colors"
                      >
                        <Check className="w-5 h-5" /> Mark as Completed
                      </button>
                      
                      <button 
                        onClick={() => {
                          if (complaint.id) {
                            setRemarkingComplaintId(complaint.id);
                            setTechnicianRemark(complaint.technicianRemark || '');
                            setRemarkStatus(complaint.status !== 'COMPLETED' ? complaint.status : 'Pending - Part Required');
                            setRemarkModalOpen(true);
                          }
                        }}
                        className="flex-1 flex justify-center items-center gap-2 bg-yellow-500 text-white py-2.5 px-4 rounded-lg font-bold hover:bg-yellow-600 transition-colors text-sm"
                      >
                        <MessageCircle className="w-4 h-4" /> Report Issue / Remark
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {complaints?.length === 0 && (
                  <div className="col-span-full py-12 text-center text-slate-500 bg-white rounded-xl shadow-sm border border-slate-200">
                      <Wrench className="mx-auto h-12 w-12 text-slate-300 mb-4" />
                      <h3 className="text-lg font-medium text-slate-900">No tasks assigned</h3>
                      <p>You have no active complaints to resolve right now.</p>
                  </div>
              )}
            </div>
          </>
        )}

        {activeTab === 'inventory' && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Package className="w-5 h-5 text-blue-600" /> Spare Parts Inventory
              </h3>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search parts..."
                  value={inventorySearch}
                  onChange={(e) => setInventorySearch(e.target.value)}
                  className="pl-9 pr-4 py-2 border border-slate-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Item Name</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Category</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Stock</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Price (₹)</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200">
                  {inventory
                    ?.filter(item => 
                      (item.partName?.toLowerCase() || '')?.includes(inventorySearch.toLowerCase()) || 
                      (item.category?.toLowerCase() || '')?.includes(inventorySearch.toLowerCase())
                    )
                    ?.map(item => (
                    <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-slate-900">{item.partName}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="px-2.5 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-slate-100 text-slate-800">
                          {item.category}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className={`text-sm font-bold ${item.stockQuantity <= 3 ? 'text-red-600' : 'text-green-600'}`}>
                          {item.stockQuantity} {item.stockQuantity <= 3 && '(Low)'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900 font-medium">
                        ₹{item.sellingPrice}
                      </td>
                    </tr>
                  ))}
                  {inventory?.filter(item => (item.partName?.toLowerCase() || '')?.includes(inventorySearch.toLowerCase()) || (item.category?.toLowerCase() || '')?.includes(inventorySearch.toLowerCase()))?.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-slate-500">
                        No parts found matching your search.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* Remark Modal */}
      {remarkModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-xl">
            <div className="p-6">
              <h3 className="text-xl font-bold text-slate-900 mb-4">Report Issue / Remark</h3>
              <form onSubmit={handleSaveRemark} className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Remark / Reason</label>
                  <textarea
                    required
                    value={technicianRemark}
                    onChange={(e) => setTechnicianRemark(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-yellow-500 focus:ring-2 focus:ring-yellow-200 outline-none transition-all resize-none h-32"
                    placeholder="Enter reason or missing part details (e.g., Part not in inventory, motor faulty, customer unavailable)"
                  ></textarea>
                </div>
                
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Status</label>
                  <select
                    value={remarkStatus}
                    onChange={(e) => setRemarkStatus(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-yellow-500 focus:ring-2 focus:ring-yellow-200 outline-none transition-all"
                  >
                    <option value="Pending - Part Required">Pending - Part Required</option>
                    <option value="In Progress">In Progress</option>
                    <option value="On Hold">On Hold</option>
                  </select>
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setRemarkModalOpen(false);
                      setRemarkingComplaintId(null);
                      setTechnicianRemark('');
                    }}
                    className="flex-1 bg-slate-100 text-slate-700 font-bold py-3 px-4 rounded-xl hover:bg-slate-200 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-yellow-500 text-white font-bold py-3 px-4 rounded-xl hover:bg-yellow-600 transition-colors"
                  >
                    Save Remark
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Resolution Modal */}
      {resolutionModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-xl">
            <div className="p-6">
              <h3 className="text-xl font-bold text-slate-900 mb-4">Complete Service</h3>
              <form onSubmit={handleResolveComplaint} className="space-y-4">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-sm font-medium text-slate-700">Replaced Part Details</label>
                    <VoiceInput 
                      isListening={isListeningPart}
                      setIsListening={setIsListeningPart}
                      onResult={(text) => setReplacedPartName(prev => prev ? `${prev} ${text}` : text)}
                    />
                  </div>
                  <textarea 
                    required
                    rows={2}
                    value={replacedPartName}
                    onChange={e => setReplacedPartName(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    placeholder="e.g. Compressor, Gas Recharge..."
                  ></textarea>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Product Serial Number</label>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      value={serialNumber} 
                      onChange={e => setSerialNumber(e.target.value)}
                      className="flex-1 px-3 py-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Enter or scan serial number"
                    />
                    <button 
                      type="button" 
                      onClick={() => setShowScanner(true)}
                      className="px-3 py-2 bg-blue-50 text-blue-600 border border-blue-200 rounded-md hover:bg-blue-100 transition-colors flex flex-col items-center justify-center shrink-0 min-w-[64px]"
                      title="Scan Serial QR/Barcode"
                    >
                      <ScanLine className="w-5 h-5 mb-0.5" />
                      <span className="text-[10px] font-bold">SCAN</span>
                    </button>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Total Cost (₹)</label>
                    <input 
                      type="number" 
                      required 
                      value={totalCost} 
                      onChange={e => setTotalCost(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                      placeholder="e.g. 1500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Payment Status</label>
                    <select 
                      value={paymentStatus} 
                      onChange={e => setPaymentStatus(e.target.value as 'Paid' | 'Pending')}
                      className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500 bg-white mb-4"
                    >
                      <option value="Paid">Paid</option>
                      <option value="Pending">Payment Pending</option>
                    </select>

                    <label className="block text-sm font-medium text-slate-700 mb-1">Payment Method</label>
                    <select 
                      value={paymentMethod} 
                      onChange={e => setPaymentMethod(e.target.value as 'Cash' | 'Online / UPI / QR')}
                      className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500 bg-white"
                    >
                      <option value="Cash">Cash</option>
                      <option value="Online / UPI / QR">Online / UPI / QR</option>
                    </select>
                  </div>
                </div>

                {paymentMethod === 'Online / UPI / QR' && (
                  <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 space-y-4">
                    <div className="flex flex-col items-center justify-center p-4 bg-white rounded-lg shadow-sm border border-slate-200">
                      <QRCode value={`upi://pay?pa=sachinelectricals@upi&pn=Sachin%20Electricals&am=${totalCost}&cu=INR`} size={120} />
                      <p className="text-sm font-bold text-slate-800 mt-3 text-center">Scan QR Code to pay</p>
                      <p className="text-xs text-slate-600 text-center mt-1">Upload the screenshot and enter the 12-digit UTR/Transaction ID below.</p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">UTR / Transaction ID</label>
                      <input 
                        type="text" 
                        value={utrNumber} 
                        onChange={e => setUtrNumber(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                        placeholder="e.g. 12-digit number"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Upload Payment Screenshot</label>
                      <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-slate-300 border-dashed rounded-md relative overflow-hidden group hover:border-blue-500 transition-colors bg-white">
                        {paymentScreenshotUrl ? (
                          <div className="absolute inset-0">
                            <img src={paymentScreenshotUrl} alt="Payment Screenshot" className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                              <p className="text-white text-sm font-medium">Click to change</p>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-1 text-center">
                            <Camera className="mx-auto h-12 w-12 text-slate-400" />
                            <div className="flex text-sm text-slate-600 justify-center">
                              <span className="relative cursor-pointer bg-transparent rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500">
                                Take photo
                              </span>
                            </div>
                          </div>
                        )}
                        <input type="file" accept="image/*" capture="environment" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={(e) => handlePhotoUpload(e, setPaymentScreenshotUrl, () => {})} />
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Old Part Photo</label>
                  <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-slate-300 border-dashed rounded-md relative overflow-hidden group hover:border-blue-500 transition-colors bg-slate-50">
                    {oldPartPhoto ? (
                      <div className="absolute inset-0">
                        <img src={oldPartPhoto} alt="Old part" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <p className="text-white text-sm font-medium">Click to change</p>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-1 text-center">
                        <Camera className="mx-auto h-8 w-8 text-slate-400" />
                        <div className="flex text-sm text-slate-600">
                          <span className="relative cursor-pointer rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none">
                            <span>Upload a file</span>
                          </span>
                        </div>
                      </div>
                    )}
                    <input type="file" accept="image/*" capture="environment" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={(e) => handlePhotoUpload(e, setOldPartPhoto, setOldPartLocation)} />
                  </div>
                  {oldPartLocation && (
                    <p className="mt-2 text-xs text-slate-500 flex items-center gap-1">
                      <MapPin className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">{oldPartLocation}</span>
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">New Part Photo</label>
                  <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-slate-300 border-dashed rounded-md relative overflow-hidden group hover:border-blue-500 transition-colors bg-slate-50">
                    {newPartPhoto ? (
                      <div className="absolute inset-0">
                        <img src={newPartPhoto} alt="New part" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <p className="text-white text-sm font-medium">Click to change</p>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-1 text-center">
                        <Camera className="mx-auto h-8 w-8 text-slate-400" />
                        <div className="flex text-sm text-slate-600">
                          <span className="relative cursor-pointer rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none">
                            <span>Upload a file</span>
                          </span>
                        </div>
                      </div>
                    )}
                    <input type="file" accept="image/*" capture="environment" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={(e) => handlePhotoUpload(e, setNewPartPhoto, setNewPartLocation)} />
                  </div>
                  {newPartLocation && (
                    <p className="mt-2 text-xs text-slate-500 flex items-center gap-1">
                      <MapPin className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">{newPartLocation}</span>
                    </p>
                  )}
                </div>

                <div className="pt-4 flex gap-3">
                  <button type="submit" className="flex-1 bg-blue-600 text-white font-bold py-2.5 px-4 rounded-lg hover:bg-blue-700 transition-colors">
                    Save Resolution
                  </button>
                  <button type="button" onClick={() => { 
                    setResolutionModalOpen(false); 
                    setResolvingComplaintId(null);
                    setSerialNumber('');
                    setOldPartPhoto('');
                    setNewPartPhoto('');
                    setOldPartLocation('');
                    setNewPartLocation('');
                    setReplacedPartName('');
                    setTotalCost('');
                  }} className="flex-1 bg-slate-200 text-slate-800 font-bold py-2.5 px-4 rounded-lg hover:bg-slate-300 transition-colors">
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* History Modal */}
      {invoiceModalOpen && selectedInvoiceComplaint && (
        <InvoiceGeneratorModal 
          complaint={selectedInvoiceComplaint} 
          onClose={() => { setInvoiceModalOpen(false); setSelectedInvoiceComplaint(null); }} 
        />
      )}

      {historyModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-xl flex flex-col max-h-[80vh]">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-xl font-bold text-slate-900">Service History ({historyPhone})</h3>
              <button onClick={() => setHistoryModalOpen(false)} className="text-slate-400 hover:text-slate-600 font-bold text-xl">&times;</button>
            </div>
            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              {customerHistory?.length === 0 ? (
                <p className="text-center text-slate-500 py-4">No previous history found.</p>
              ) : (
                customerHistory?.map(c => (
                  <div key={c.id} className="border border-slate-200 rounded-lg p-4 shadow-sm bg-white">
                    <div className="flex justify-between mb-2">
                      <p className="font-bold text-slate-800">{c.product}</p>
                      <p className="text-sm text-slate-500">{new Date(c.createdAt).toLocaleDateString()}</p>
                    </div>
                    <p className="text-sm text-slate-600 mb-2">Issue: {c?.issue}</p>
                    <p className="text-xs font-semibold mt-1">Status: <span className={c?.status === 'COMPLETED' ? 'text-green-600' : 'text-yellow-600'}>{c?.status}</span></p>
                    {c?.status === 'COMPLETED' && c.resolutionDetails && (
                      <div className="mt-2 pt-2 border-t border-slate-100">
                        <p className="text-sm text-slate-700 font-medium">Replaced: {c.resolutionDetails.replacedPartName}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <p className="text-sm text-slate-700 font-bold">Cost: ₹{c.resolutionDetails.totalCost}</p>
                          {c.resolutionDetails.paymentMethod === 'Online / UPI / QR' && (
                            <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200">
                              UTR: {c.resolutionDetails.utrNumber || 'N/A'}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {showScanner && (
        <BarcodeScanner 
          onScan={(text) => {
            setSerialNumber(text);
            setShowScanner(false);
          }}
          onClose={() => setShowScanner(false)}
        />
      )}
    </div>
  );
}


export default function TechnicianDashboard(props: any) {
  return (
    <ErrorBoundary>
      <InnerTechnicianDashboard {...props} />
    </ErrorBoundary>
  );
}
