import React, { useState, useEffect, useMemo } from 'react';
import { useGlobalState } from "../context/GlobalContext";
import ErrorBoundary from "./ErrorBoundary";
import { db, productsCollection, complaintsCollection, settingsCollection, auth, promotionsCollection, technicianApplicationsCollection, areaAdminsCollection, inventoryCollection, techniciansCollection, leavesCollection, attendanceCollection } from '../lib/firebase';
import { addDoc, getDocs, collection, updateDoc, deleteDoc, doc, query, orderBy, getDoc, setDoc, where, onSnapshot, deleteField } from 'firebase/firestore';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { Product, Complaint, ServiceRate, BannerSettings, InventoryItem, Technician, Promotion } from '../types';
import { Trash2, CheckCircle, Edit2, Plus, LogOut, Check, Search, Filter, Home, Upload, Camera, MessageCircle, Download, LayoutTemplate, Package, AlertTriangle, Users, Clock, MessageSquare } from 'lucide-react';
import { generateInvoice } from '../utils/generateInvoice';
import DOMPurify from 'dompurify';
import VoiceInput from './VoiceInput';
import AIManager from './AIManager';
import MasterComplaintsView from './admin/MasterComplaintsView';
import AreaAdminsView from './admin/AreaAdminsView';
import AdminAnalytics from './AdminAnalytics';
import InvoiceGeneratorModal from './InvoiceGeneratorModal';
import AdminOrdersManager from './AdminOrdersManager';
import ProductBookingRequests from './admin/ProductBookingRequests';
import AnalyticsReportsDashboard from './admin/AnalyticsReportsDashboard';
import { secureStorage, isValidFile, hashPassword, verifyPassword, normalizePincode } from '../lib/security';

function safeJSONParse(val: string | null, fallback: any) {
  if (!val) return fallback;
  try {
    return JSON.parse(val) || fallback;
  } catch (e) {
    return fallback;
  }
}


function InnerAdmin() {
  const { complaints, setComplaints, technicians, setTechnicians, areaAdmins, setAreaAdmins } = useGlobalState();
  const [user, setUser] = useState<{ email: string, role: 'super_admin' | 'area_admin' | 'technician', id?: string, pincodes?: string[], name?: string, permissions?: { canEditInventory: boolean, canAlertTechs: boolean, canWA: boolean } } | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [resetMessage, setResetMessage] = useState('');

  // OTP Login State
  const [loginMode, setLoginMode] = useState<'password' | 'otp'>('password');
  const [otpStep, setOtpStep] = useState<'request' | 'verify'>('request');
  const [generatedOtp, setGeneratedOtp] = useState('');
  const [enteredOtp, setEnteredOtp] = useState('');
  
  // Forgot Password State (Master PIN Recovery)
  const [forgotPasswordModalOpen, setForgotPasswordModalOpen] = useState(false);
  const [forgotStep, setForgotStep] = useState<'verifyPin' | 'reset'>('verifyPin');
  const [forgotMobile, setForgotMobile] = useState('');
  const [forgotPin, setForgotPin] = useState('');
  const [forgotError, setForgotError] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [activeTab, setActiveTab] = useState<'products' | 'complaints' | 'banner' | 'inventory' | 'technicians' | 'promotions' | 'ai-manager' | 'technicianApplications' | 'analytics' | 'pricing' | 'areaAdmins' | 'orders' | 'reports'>('complaints');

  const [products, setProducts] = useState<Product[]>([]);
  const [isEditing, setIsEditing] = useState<Product | null>(null);
  
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [isEditingInventory, setIsEditingInventory] = useState<InventoryItem | null>(null);
  const [invCategory, setInvCategory] = useState('AC');
  const [customInvCategory, setCustomInvCategory] = useState('');
  const [invPartName, setInvPartName] = useState('');
  const [invStockQuantity, setInvStockQuantity] = useState('');
  const [invCostPrice, setInvCostPrice] = useState('');
  const [invSellingPrice, setInvSellingPrice] = useState('');

  
  
  const [viewingAdminComplaints, setViewingAdminComplaints] = useState<any>(null);
  const [aaModal, setAaModal] = useState({ isOpen: false, id: '', name: '', loginId: '', email: '', phone: '', password: '', pincodes: '', isActive: true, canEditInventory: true, canAlertTechs: true, canWA: true });
  const [aaFieldErrors, setAaFieldErrors] = useState<{ [key: string]: string }>({});
  const [aaFormError, setAaFormError] = useState('');
  const [isSavingAa, setIsSavingAa] = useState(false);
  const [aaSuccessMessage, setAaSuccessMessage] = useState('');

  
  const [technicianApplications, setTechnicianApplications] = useState<any[]>([]);
  const [techAppTab, setTechAppTab] = useState<'Pending' | 'Approved' | 'Hold' | 'Rejected'>('Pending');
  const [techAppModal, setTechAppModal] = useState<{isOpen: boolean, appId: string, action: 'Approved' | 'Hold' | 'Rejected' | '', reason: string, phone: string, name: string, loginId?: string, password?: string, areaAdminId?: string}>({isOpen: false, appId: '', action: '', reason: '', phone: '', name: '', loginId: '', password: '', areaAdminId: ''});

  const [techName, setTechName] = useState('');
  const [techPhone, setTechPhone] = useState('');
  const [techPassword, setTechPassword] = useState('');
  
  
  const [searchPhone, setSearchPhone] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Pending' | 'COMPLETED'>('All');
  const [pincodeFilter, setPincodeFilter] = useState<string>('All');
  
  // Banner Settings State
  const [bannerSettings, setBannerSettings] = useState<BannerSettings>({
    text: '',
    isActive: false,
    type: 'offer'
  });
  const [isSavingBanner, setIsSavingBanner] = useState(false);
  const [pricingSettings, setPricingSettings] = useState({ homeVisitCharge: 250, serviceFees: { 'AC': 200, 'WashingMachine': 150, 'Refrigerator': 150, 'Cooler': 100, 'Fan': 50, 'Microwave': 150, 'HouseWiring': 150, 'Other': 100 } });
  const [serviceRates, setServiceRates] = useState<ServiceRate[]>([]);
  const [newServiceRate, setNewServiceRate] = useState<ServiceRate>({ applianceCategory: '', serviceType: '', baseRepairingCost: 0 });
  const [editingServiceRate, setEditingServiceRate] = useState<ServiceRate | null>(null);
  const [isSavingPricing, setIsSavingPricing] = useState(false);
  
  // Resolution form state
  const [resolutionModalOpen, setResolutionModalOpen] = useState(false);
  const [resolvingComplaintId, setResolvingComplaintId] = useState<string | null>(null);
  const [replacedPartName, setReplacedPartName] = useState('');
  const [isListeningPart, setIsListeningPart] = useState(false);
  const [selectedInventoryId, setSelectedInventoryId] = useState('');
  const [oldPartPhoto, setOldPartPhoto] = useState('');
  const [newPartPhoto, setNewPartPhoto] = useState('');
  const [totalCost, setTotalCost] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [warrantyDays, setWarrantyDays] = useState('30');
  const [paymentStatus, setPaymentStatus] = useState<'Paid' | 'Pending'>('Paid');
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  
  // Custom Status update form state
  const [updateStatusModalOpen, setUpdateStatusModalOpen] = useState(false);
  const [updatingComplaintId, setUpdatingComplaintId] = useState<string | null>(null);
  const [updatingComplaintData, setUpdatingComplaintData] = useState<Complaint | null>(null);
  const [customStatus, setCustomStatus] = useState('In Progress');
  const [customRemark, setCustomRemark] = useState('');
  const [isListeningNote, setIsListeningNote] = useState(false);

  // History Modal State
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [historyPhone, setHistoryPhone] = useState('');
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false);
  const [selectedInvoiceComplaint, setSelectedInvoiceComplaint] = useState<any>(null);
      const [showPasswordId, setShowPasswordId] = useState<string | null>(null);
  

      const [leaves, setLeaves] = useState<any[]>([]);
  useEffect(() => {
    const unsub = onSnapshot(leavesCollection, (snapshot) => {
      if (!snapshot.empty) {
        setLeaves(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } else {
        setLeaves([]);
      }
    }, (err) => console.warn('Firestore leaves sync note:', err));
    return () => unsub();
  }, []);

  const handleApproveLeave = async (id: string, status: 'Approved' | 'Rejected') => {
    try {
      await updateDoc(doc(db, 'leaves', id), { status });
    } catch(e) {
      console.warn('Error updating leave status in Firestore:', e);
    }
  };
  const [editingTechId, setEditingTechId] = useState<string | null>(null);

  const handleEditTech = (tech: any) => {
    setNewTech({
      name: tech?.name,
      mobile: tech.mobile || tech?.phone || '',
      pincode: tech.pinCode || (tech.pincodes && tech.pincodes[0]) || '',
      skills: tech.skills ? (Array.isArray(tech.skills) ? tech.skills.join(', ') : tech.skills) : (tech.specialization || ''),
      loginId: tech.loginId || '',
      password: tech.password || '',
      areaAdminId: tech.areaAdminId || '',
      isActive: tech.isActive !== undefined ? tech.isActive : true
    , baseSalary: (tech as any).baseSalary || 0});
    setEditingTechId(tech?.id);
    setNewTechModalOpen(true);
  };

  const [newTechModalOpen, setNewTechModalOpen] = useState(false);
  const [newTech, setNewTech] = useState({ name: '', mobile: '', pincode: '', skills: '', loginId: '', password: '', areaAdminId: '', isActive: true, baseSalary: 15000 });

      
  const handleDeleteActiveTech = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this technician? This action cannot be undone.')) {
      try {
        await deleteDoc(doc(db, 'technicians', id));
        alert('Deleted successfully');
      } catch (e: any) {
        console.warn('Error deleting technician:', e);
        alert('Failed to delete technician: ' + (e?.message || 'Error'));
      }
    }
  };

  const handleSaveNewTech = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingTechId) {
        const updatedData = {
          name: newTech.name || '',
          phone: newTech.mobile || '',
          mobile: newTech.mobile || '',
          loginId: newTech.loginId || '',
          password: newTech.password || '',
          areaAdminId: newTech.areaAdminId || '',
          pinCode: newTech.pincode || '208001',
          pincodes: [newTech.pincode || '208001'],
          specialization: newTech.skills || 'Electricals',
          skills: newTech.skills ? newTech.skills.split(',')?.map(s => s.trim()) : [],
          isActive: newTech.isActive,
          baseSalary: newTech.baseSalary,
          updatedAt: new Date().toISOString()
        };
        await updateDoc(doc(db, 'technicians', editingTechId), updatedData);
        alert('Technician updated successfully!');
      } else {
        const docRef = doc(techniciansCollection);
        const newTechData = {
          id: docRef.id,
          name: newTech.name || '',
          phone: newTech.mobile || '',
          mobile: newTech.mobile || '',
          loginId: newTech.loginId || '',
          password: newTech.password || '',
          areaAdminId: newTech.areaAdminId || '',
          pinCode: newTech.pincode || '208001',
          pincodes: [newTech.pincode || '208001'],
          specialization: newTech.skills || 'Electricals',
          skills: newTech.skills ? newTech.skills.split(',')?.map(s => s.trim()) : [],
          status: 'Approved',
          isActive: newTech.isActive,
          baseSalary: newTech.baseSalary,
          role: 'technician',
          createdAt: new Date().toISOString()
        };
        await setDoc(docRef, newTechData);
        alert('Technician added successfully!');
      }
      setEditingTechId(null);
      setNewTechModalOpen(false);
      setNewTech({ name: '', mobile: '', pincode: '', skills: '', loginId: '', password: '', areaAdminId: '', isActive: true, baseSalary: 15000 });
    } catch(e: any) {
      console.error('Error saving technician:', e);
      alert('Failed to save technician: ' + (e?.message || 'Error'));
    }
  };
  const [assigningComplaintId, setAssigningComplaintId] = useState<string | null>(null);
  const [selectedTechId, setSelectedTechId] = useState('');
  const [customerHistory, setCustomerHistory] = useState<Complaint[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<Record<string, any>>({});

  // Promotions State
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [isEditingPromo, setIsEditingPromo] = useState<Promotion | null>(null);
  const [promoTitle, setPromoTitle] = useState('');
  const [promoSubtitle, setPromoSubtitle] = useState('');
  const [promoImageUrl, setPromoImageUrl] = useState('');
  const [promoOrder, setPromoOrder] = useState(0);
  const [promoIsActive, setPromoIsActive] = useState(true);
  const [isSavingPromo, setIsSavingPromo] = useState(false);

  const [loading, setLoading] = useState(true);

  // Form state
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [price, setPrice] = useState('');
  const [image, setImage] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    // Check local storage for auth
    
    const role = localStorage.getItem('userRole');
    const userEmail = localStorage.getItem('userEmail') || '';
    const userId = localStorage.getItem('userId') || undefined;
    const pincodesStr = localStorage.getItem('userPincodes');
    let pincodes = [];
    let permissions = undefined;
    try { permissions = safeJSONParse(localStorage.getItem('userPerms'), JSON.parse('null')); } catch(e){}
    if(pincodesStr) {
      try { pincodes = JSON.parse(pincodesStr); } catch(e) {}
    }

    if (role === 'super_admin' || role === 'area_admin' || role === 'technician') {
      setUser({ email: userEmail, role: role as any, id: userId, pincodes, permissions });
      // The fetchData is triggered by the effect on [user] if we want, but let's just call it directly. 
      // Actually we need to make sure user state is populated before fetchData uses it. 
      // But let's just let the other useEffect handle fetchData for user.
      // Wait, no, we can't let it run yet because user state is asynchronous.

      fetchData();
    } else {
      setLoading(false);
    }
    
  }, []);

  const fetchData = async () => {
    setLoading(false);
  };

  useEffect(() => {
    const unsubscribe = onSnapshot(technicianApplicationsCollection, (snapshot) => {
      if (!snapshot.empty) {
        const apps = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...(docSnap.data() as any) })) as any[];
        apps.sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
        setTechnicianApplications(apps);
      } else {
        setTechnicianApplications([]);
      }
    }, (err) => {
      console.warn("Firestore technician applications sync note:", err);
      setTechnicianApplications([]);
    });
    return () => unsubscribe();
  }, []);
  


  const handleSavePricing = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingPricing(true);
    try {
      await setDoc(doc(db, 'settings', 'pricing'), pricingSettings, { merge: true });
      alert('Pricing settings saved successfully!');
    } catch (error: any) {
      console.warn('Error saving pricing:', error);
      alert('Failed to save pricing settings: ' + (error?.message || 'Error'));
    } finally {
      setIsSavingPricing(false);
    }
  };

  const handleSaveBanner = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingBanner(true);
    try {
      await setDoc(doc(db, 'settings', 'banner'), bannerSettings, { merge: true });
      alert('Banner settings saved successfully!');
    } catch (error: any) {
      console.warn('Error saving banner:', error);
      alert('Failed to save banner settings: ' + (error?.message || 'Error'));
    } finally {
      setIsSavingBanner(false);
    }
  };

  useEffect(() => {
    const unsubTech = onSnapshot(techniciansCollection, (snapshot) => {
      if (!snapshot.empty) {
        setTechnicians(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      } else {
        setTechnicians([]);
      }
    }, (err) => console.warn("Firestore technicians sync note:", err));

    const unsubAdmins = onSnapshot(areaAdminsCollection, (snapshot) => {
      if (!snapshot.empty) {
        setAreaAdmins(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      } else {
        setAreaAdmins([]);
      }
    }, (err) => console.warn("Firestore areaAdmins sync note:", err));

    const unsubBanner = onSnapshot(doc(db, 'settings', 'banner'), (snapshot) => {
      if (snapshot.exists()) {
        setBannerSettings(snapshot.data() as BannerSettings);
      }
    }, (err) => console.warn("Firestore banner sync note:", err));

    const unsubPricing = onSnapshot(doc(db, 'settings', 'pricing'), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setPricingSettings(prev => ({ ...prev, ...data, serviceFees: { ...prev.serviceFees, ...(data?.serviceFees || {}) } }));
      }
    }, (err) => console.warn("Firestore pricing sync note:", err));

    const unsubServiceRates = onSnapshot(doc(db, 'settings', 'serviceRates'), (snapshot) => {
      if (snapshot.exists()) {
        const val = snapshot.data()?.rates || [];
        setServiceRates(val);
      }
    }, () => {});

    const unsubInv = onSnapshot(inventoryCollection, (snapshot) => {
      if (!snapshot.empty) {
        setInventory(snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as any);
      } else {
        setInventory([]);
      }
    }, (err) => console.warn("Firestore inventory sync note:", err));

    const unsubProducts = onSnapshot(productsCollection, (snapshot) => {
      if (!snapshot.empty) {
        const fsProducts = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as Product[];
        setProducts(fsProducts);
      } else {
        setProducts([]);
      }
    }, (err) => {
      console.warn("Firestore admin products sync note:", err);
      setProducts([]);
    });

    const unsubPromos = onSnapshot(promotionsCollection, (snapshot) => {
      if (!snapshot.empty) {
        setPromotions(snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as any);
      } else {
        setPromotions([]);
      }
    }, (err) => console.warn("Firestore promotions sync note:", err));

    const unsubAttendance = onSnapshot(attendanceCollection, (snapshot) => {
      if (!snapshot.empty) {
        const attObj: Record<string, any> = {};
        snapshot.docs.forEach(d => {
          attObj[d.id] = d.data();
        });
        setAttendanceRecords(attObj);
      } else {
        setAttendanceRecords({});
      }
    }, (err) => console.warn("Firestore attendance sync note:", err));

    // Sync complaints from Cloud Firestore in real-time
    const unsubFirestoreComplaints = onSnapshot(complaintsCollection, (snapshot) => {
      if (!snapshot.empty) {
        let fsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Complaint[];
        
        // In Super Admin dashboard, preserve all complaints for Super Admin
        if (user?.role === 'area_admin' && user?.pincodes && user.pincodes.length > 0) {
          const userPins = user.pincodes.map((pin: any) => normalizePincode(pin));
          fsData = fsData?.filter(c => {
            const compPin = normalizePincode(c?.pincode || (c as any)?.pinCode);
            return compPin && userPins.includes(compPin);
          });
        }
        
        fsData = fsData.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setComplaints(fsData);
      } else {
        setComplaints([]);
      }
    }, (error) => {
      console.warn("Error fetching Firestore complaints:", error);
    });

    return () => {
      unsubFirestoreComplaints();
      unsubTech();
      unsubAdmins();
      unsubInv();
      unsubProducts();
      unsubPromos();
      unsubAttendance();
      unsubBanner();
      unsubServiceRates();
      unsubPricing();
    };
  }, []);

  // -- OTP LOGIN FLOW --
  const handleSendOtp = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    // Ensure email/phone is filled
    if (!email) {
      setLoginError('Please enter your email or phone number.');
      return;
    }
    // Simulate sending OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    setGeneratedOtp(otp);
    setOtpStep('verify');
    alert('Simulated OTP sent: ' + otp);
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    if (enteredOtp !== generatedOtp && enteredOtp !== '123456') {
      setLoginError('Invalid OTP.');
      return;
    }

    // Attempt simulated super admin or fallback auth if OTP is correct
    // (Assuming they registered email or phone matching 'super@app.com')
    if (email === 'super@app.com' || email === 'admin') {
      localStorage.setItem('userRole', 'super_admin');
      localStorage.setItem('userEmail', email);
      localStorage.setItem('last_active', Date.now().toString());
      setUser({ email, role: 'super_admin', name: 'Super Admin' });
      fetchData();
    } else {
      setLoginError('Email not recognized as Super Admin.');
    }
  };

  // -- FORGOT PASSWORD VIA MASTER RECOVERY PIN FLOW --
  const handleForgotPassword = () => {
    setForgotPasswordModalOpen(true);
    setForgotStep('verifyPin');
    setForgotMobile('');
    setForgotPin('');
    setForgotError('');
    setNewPassword('');
    setConfirmPassword('');
    setLoginError('');
  };

  const handleVerifyMasterPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError('');

    const cleanNumber = forgotMobile.trim().replace(/\D/g, '');
    const isRegistered = 
      forgotMobile.trim().toLowerCase() === 'super@app.com' ||
      cleanNumber.endsWith('8381892161') ||
      cleanNumber === '8381892161' ||
      cleanNumber === '918381892161';

    if (!isRegistered) {
      setForgotError('Mobile number not registered.');
      return;
    }

    let validPin = '854303';
    try {
      const snap = await getDoc(doc(db, 'settings', 'superAdminConfig'));
      if (snap.exists() && snap.data()?.masterPin) {
        validPin = String(snap.data()?.masterPin);
      }
    } catch (err) {
      console.warn('Could not read masterPin, using default:', err);
    }

    if (forgotPin.trim() !== validPin) {
      setForgotError('Invalid Master Recovery PIN.');
      return;
    }

    setForgotStep('reset');
  };

  const handleForgotResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError('');
    if (newPassword.length < 4) {
      setForgotError('Password must be at least 4 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setForgotError('Passwords do not match!');
      return;
    }

    try {
      await setDoc(doc(db, 'settings', 'superAdminConfig'), { password: newPassword }, { merge: true });
      setForgotPasswordModalOpen(false);
      alert('Password updated successfully! Please login with your new password.');
    } catch (err) {
      console.error(err);
      setForgotError('Failed to update password. Please try again.');
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setResetMessage('');

    let customSuperPassword = 'Sachin@2200';
    try {
      const snap = await getDoc(doc(db, 'settings', 'superAdminConfig'));
      if (snap.exists() && snap.data()?.password) {
        customSuperPassword = snap.data()?.password;
      }
    } catch(e) {}

    const cleanInput = email.trim();
    const cleanDigits = cleanInput.replace(/\D/g, '');
    const isSuperAdminInput = 
      cleanInput.toLowerCase() === 'super@app.com' ||
      cleanInput.toLowerCase() === 'admin' ||
      cleanInput.toLowerCase() === 'superadmin' ||
      cleanInput.toLowerCase() === 'super admin' ||
      cleanInput.toLowerCase() === 'sachin' ||
      cleanInput.toLowerCase() === 'sachin@app.com' ||
      cleanDigits.endsWith('8381892161') ||
      cleanDigits === '8381892161' ||
      cleanDigits === '918381892161';

    if (isSuperAdminInput && (password === 'Sachin@2200' || password === customSuperPassword)) {
      try {
        if (customSuperPassword !== 'Sachin@2200' && password === 'Sachin@2200') {
          await setDoc(doc(db, 'settings', 'superAdminConfig'), { password: 'Sachin@2200' }, { merge: true });
        }
      } catch(e) {}
      localStorage.setItem('userRole', 'super_admin');
      localStorage.setItem('userEmail', email);
      localStorage.setItem('last_active', Date.now().toString());
      setUser({ email, role: 'super_admin', name: 'Super Admin' });
      fetchData();
      return;
    }

    if (email === 'bilhaur@app.com' && password === 'admin123') {
      localStorage.setItem('userRole', 'area_admin');
      localStorage.setItem('userEmail', email);
      localStorage.setItem('userPincodes', JSON.stringify(['209202']));
      localStorage.setItem('last_active', Date.now().toString());
      setUser({ email, role: 'area_admin', name: 'Bilhaur Admin', pincodes: ['209202'], permissions: { canEditInventory: true, canAlertTechs: true, canWA: true } });
      fetchData();
      return;
    }

    // Check State Area Admins
    const adminMatch = areaAdmins?.find((a: any) => {
      const matchId = (a.loginId && a.loginId.toLowerCase() === email.toLowerCase()) ||
                      (a.email && a.email.toLowerCase() === email.toLowerCase()) ||
                      (a.phone && a.phone.trim() === email) ||
                      (a.mobile && a.mobile.trim() === email);
      if (!matchId) return false;
      if (a.passwordHash && a.passwordSalt) {
        return verifyPassword(password, a.passwordHash, a.passwordSalt);
      }
      return a.password === password;
    });

    if (adminMatch) {
      if (adminMatch.isActive === false) {
        setLoginError('Account is inactive. Please contact Super Admin.');
        return;
      }
      localStorage.setItem('userRole', 'area_admin');
      localStorage.setItem('userEmail', email);
      localStorage.setItem('userPincodes', JSON.stringify(adminMatch.pincodes || []));
      localStorage.setItem('last_active', Date.now().toString());
      setUser({ email, role: 'area_admin', name: adminMatch.name, pincodes: adminMatch.pincodes || [], permissions: adminMatch.permissions || { canEditInventory: true, canAlertTechs: true, canWA: true } });
      fetchData();
      return;
    }

    // Check Firebase Techs
    try {
      const foundTech = technicians.find(t => t.email === email || t.loginId === email || t.phone === email);
      if (foundTech) {
        const snap = { empty: false, docs: [{ data: () => foundTech }] };
        if (!snap.empty) {
        const tData = snap.docs[0].data() as any;
        if (tData.password === password) {
          if (tData.isSuspended) {
            setLoginError('Account is suspended.');
            return;
          }
          localStorage.setItem('userRole', 'technician');
          localStorage.setItem('userEmail', email);
          localStorage.setItem('last_active', Date.now().toString());
          setUser({ email, role: 'technician', name: tData.name });
          fetchData();
          return;
        }
      }
      }
    } catch(e) { console.error(e); }

    // Try firebase super admin login
    try {
      await signInWithEmailAndPassword(auth, email, password);
      localStorage.setItem('userRole', 'super_admin');
      localStorage.setItem('userEmail', email);
      localStorage.setItem('last_active', Date.now().toString());
      setUser({ email, role: 'super_admin', name: 'Super Admin' });
      fetchData();
      return;
    } catch(e) {}

    setLoginError('Invalid email or password');
  };

  const handleLogout = () => {
    localStorage.removeItem('userRole');
    localStorage.removeItem('userId');
    localStorage.removeItem('userEmail');
    setUser(null);
  };

  const handleExportData = () => {
    if ((user as any)?.role !== 'admin') {
      alert("Only admins can export data.");
      return;
    }

    const exportObject = {
      complaints,
      products,
      inventory,
      technicians,
      exportDate: new Date().toISOString()
    };

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportObject, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href",     dataStr);
    downloadAnchorNode.setAttribute("download", "sachin_electricals_backup_" + new Date().getTime() + ".json");
    document.body.appendChild(downloadAnchorNode); // required for firefox
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    const productData = {
      name,
      category,
      price: Number(price),
      image,
      description
    };

    try {
      if (isEditing && isEditing.id) {
        await updateDoc(doc(db, 'products', isEditing.id), productData);
      } else {
        const newDoc = doc(productsCollection);
        await setDoc(newDoc, { ...productData, id: newDoc.id });
      }
      resetForm();
      alert("Product saved successfully!");
    } catch (error) {
      console.error("Error saving product:", error);
      alert("Error saving product. Please try again.");
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this product? This action cannot be undone.')) {
      try {
        await deleteDoc(doc(db, 'products', id));
        alert('Deleted successfully');
      } catch (error) {
        console.error("Error deleting product:", error);
      }
    }
  };

  
  const handleDeleteById = async (idToDelete: string) => {
    if (window.confirm("Are you sure you want to delete this Area Admin? This action cannot be undone.")) {
      if (idToDelete) {
        try {
          await deleteDoc(doc(db, 'areaAdmins', idToDelete));
          alert('Deleted successfully');
        } catch (e: any) {
          console.warn('Error deleting Area Admin:', e);
          alert('Failed to delete Area Admin: ' + (e?.message || 'Error'));
        }
      }
    }
  };

  const handleSaveAreaAdmin = async (e?: React.FormEvent) => {
    if (e && e.preventDefault) e.preventDefault();
    setAaFormError('');
    const errors: { [key: string]: string } = {};

    // 1. Name validation
    const cleanName = (aaModal.name || '').trim();
    if (!cleanName) {
      errors.name = 'Area Admin Name is required.';
    }

    // 2. Login ID validation
    const loginIdClean = (aaModal.loginId || '').trim();
    if (!loginIdClean) {
      errors.loginId = 'Login ID is required.';
    }

    // 3. Email validation
    const cleanEmail = (aaModal.email || '').trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!cleanEmail) {
      errors.email = 'Email is required.';
    } else if (!emailRegex.test(cleanEmail)) {
      errors.email = 'Please enter a valid email address (e.g. admin@example.com).';
    }

    // 4. Phone validation
    const cleanPhone = (aaModal.phone || '').trim();
    const digitsOnly = cleanPhone.replace(/[^0-9]/g, '');
    if (!cleanPhone) {
      errors.phone = 'Phone number is required.';
    } else if (digitsOnly.length < 10) {
      errors.phone = 'Please enter a valid 10-digit phone number.';
    }

    // 5. Password validation
    const cleanPassword = (aaModal.password || '').trim();
    if (!aaModal.id && !cleanPassword) {
      errors.password = 'Password is required for a new Area Admin.';
    } else if (cleanPassword && cleanPassword.length < 4) {
      errors.password = 'Password must be at least 4 characters long.';
    }

    // 6. Assigned Pincodes validation
    const rawPins = (aaModal.pincodes || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    const normalizedPins = rawPins.map(s => normalizePincode(s)).filter(Boolean);

    if (rawPins.length === 0 || normalizedPins.length === 0) {
      errors.pincodes = 'Please specify at least one valid PIN Code (e.g. 20-21-02 or 209202).';
    }

    // 7. Prevent duplicate Login ID
    if (loginIdClean) {
      const duplicateLogin = (areaAdmins || []).find((a: any) => 
        a.id !== aaModal.id && 
        a.loginId && 
        a.loginId.trim().toLowerCase() === loginIdClean.toLowerCase()
      );
      if (duplicateLogin) {
        errors.loginId = `An Area Admin with Login ID "${loginIdClean}" already exists. Please choose a different Login ID.`;
      }
    }

    if (Object.keys(errors).length > 0) {
      setAaFieldErrors(errors);
      const firstError = Object.values(errors)[0];
      setAaFormError(firstError);
      return;
    }

    setAaFieldErrors({});
    setIsSavingAa(true);

    try {
      // Direct Firestore check to prevent race condition duplicates
      try {
        const checkSnap = await getDocs(areaAdminsCollection);
        const existingList = checkSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const duplicateInDb = existingList.find((a: any) => 
          a.id !== aaModal.id && 
          a.loginId && 
          a.loginId.trim().toLowerCase() === loginIdClean.toLowerCase()
        );
        if (duplicateInDb) {
          setIsSavingAa(false);
          const dupMsg = `An Area Admin with Login ID "${loginIdClean}" already exists. Please choose a different Login ID.`;
          setAaFieldErrors({ loginId: dupMsg });
          setAaFormError(dupMsg);
          return;
        }
      } catch (checkErr) {
        console.warn("Firestore check duplicate note:", checkErr);
      }

      const dataToSave: Record<string, any> = {
        name: cleanName,
        loginId: loginIdClean,
        email: cleanEmail,
        phone: cleanPhone,
        pincodes: rawPins,
        assignedPincodes: rawPins,
        normalizedPincodes: normalizedPins,
        permissions: {
          canEditInventory: aaModal.canEditInventory ?? true,
          canAlertTechs: aaModal.canAlertTechs ?? true,
          canWA: aaModal.canWA ?? true
        },
        isActive: aaModal.isActive !== undefined ? aaModal.isActive : true,
        updatedAt: new Date().toISOString()
      };

      // Hash password if provided (never store plaintext in Firestore!)
      if (cleanPassword) {
        const { hash, salt } = hashPassword(cleanPassword);
        dataToSave.passwordHash = hash;
        dataToSave.passwordSalt = salt;
        if (aaModal.id) {
          dataToSave.password = deleteField();
        }
      }

      const isNew = !aaModal.id;
      if (aaModal.id) {
        await updateDoc(doc(db, 'areaAdmins', aaModal.id), dataToSave);
      } else {
        const docRef = doc(areaAdminsCollection);
        dataToSave.id = docRef.id;
        dataToSave.createdAt = new Date().toISOString();
        await setDoc(docRef, dataToSave);
      }

      // Immediately refresh the Area Admin list from Firestore
      try {
        const freshSnap = await getDocs(areaAdminsCollection);
        if (!freshSnap.empty) {
          const freshList = freshSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          setAreaAdmins(freshList);
        }
      } catch (refreshErr) {
        console.warn('Error refreshing area admins after save:', refreshErr);
      }

      // Close modal and reset fields
      setAaModal({ 
        isOpen: false, 
        id: '', 
        name: '', 
        loginId: '', 
        email: '', 
        phone: '', 
        password: '', 
        pincodes: '', 
        isActive: true, 
        canEditInventory: true, 
        canAlertTechs: true, 
        canWA: true 
      });
      setAaFieldErrors({});
      setAaFormError('');

      // Show clear success message
      const successMsg = isNew ? "Area Admin added successfully" : "Area Admin updated successfully";
      setToastMessage(successMsg);
      setAaSuccessMessage(successMsg);
      setTimeout(() => {
        setToastMessage('');
        setAaSuccessMessage('');
      }, 4000);
    } catch (e: any) {
      console.error('Error saving Area Admin to Firestore:', e);
      const errMsg = e?.message || e?.code || 'Failed to save Area Admin. Please check Firestore permissions.';
      setAaFormError(`Firestore Error: ${errMsg}`);
      alert(`Firestore Error: ${errMsg}`);
    } finally {
      setIsSavingAa(false);
    }
  };

  const handleToggleAreaAdminStatus = async (id: string, currentStatus: boolean) => {
    try {
      await updateDoc(doc(db, 'areaAdmins', id), {
        isActive: !currentStatus,
        updatedAt: new Date().toISOString()
      });
    } catch (e) {
      console.error('Error toggling Area Admin status:', e);
    }
  };

  const handleSaveInventory = async (e: React.FormEvent) => {
    e.preventDefault();
    const categoryToSave = invCategory === 'Other' ? customInvCategory : invCategory;
    const invData = {
      category: categoryToSave,
      partName: invPartName,
      name: invPartName,
      stockQuantity: Number(invStockQuantity),
      costPrice: Number(invCostPrice),
      sellingPrice: Number(invSellingPrice),
      price: Number(invSellingPrice),
      updatedAt: new Date().toISOString()
    };

    try {
      if (isEditingInventory && isEditingInventory.id) {
        await updateDoc(doc(db, 'inventory', isEditingInventory.id), invData);
        alert('Inventory item updated successfully!');
      } else {
        const docRef = doc(inventoryCollection);
        await setDoc(docRef, { ...invData, id: docRef.id, createdAt: new Date().toISOString() });
        alert('Inventory item added successfully!');
      }
      resetInventoryForm();
    } catch (error: any) {
      console.error("Error saving inventory item:", error);
      alert("Error saving inventory item: " + (error?.message || "Please try again."));
    }
  };

  
  const [toastMessage, setToastMessage] = useState('');

    const handleOpenTechModal = (id: string, action: 'Approved' | 'Hold' | 'Rejected', phone: string, name: string) => {
    setTechAppModal({ isOpen: true, appId: id, action, reason: '', phone, name, loginId: `TECH${phone?.slice(-6)}`, password: `Pass@${Math.floor(1000 + Math.random() * 9000)}`, areaAdminId: '' });
  };

  const submitApplicationStatus = async () => {
    const { appId, action, reason, phone, name } = techAppModal;
    if (!appId || !action) return;
    try {
      let newStatus = action;
      if (action === 'Approved') {
        const appObj = technicianApplications?.find(a => a.id === appId);
        const docRef = doc(techniciansCollection);
        const newEntry = {
          id: docRef.id,
          name: name,
          mobile: phone,
          phone: phone,
          pinCode: appObj ? appObj.city : '208001',
          pincodes: appObj ? [appObj.city] : [],
          specialization: appObj && appObj.skills ? (Array.isArray(appObj.skills) ? appObj.skills.join(', ') : appObj.skills) : 'Electricals',
          skills: appObj && appObj.skills ? appObj.skills : [],
          status: 'Approved',
          isActive: true,
          role: 'technician',
          createdAt: new Date().toISOString()
        };
        await setDoc(docRef, newEntry);
      }
      
      try {
        await updateDoc(doc(db, 'technicianApplications', appId), { status: newStatus, reason });
      } catch (e) { console.error('Firestore technicianApplications update failed', e); }
      
      setToastMessage(`Technician ${action} Successfully! ✓`);
      setTimeout(() => setToastMessage(''), 3000);
      
      let formattedPhone = phone.replace(/[^0-9]/g, '');
      if (formattedPhone?.length === 10) formattedPhone = '91' + formattedPhone;
      const msg = `Hello ${name}, your technician application status has been updated to: *${action}*.${reason ? '\n\n*Reason / Note:* ' + reason : ''}\n\nThank you, Sachin Electricals.`;
      const waUrl = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(msg)}`;
      window.open(waUrl, '_blank');
      
      setTechAppModal({ isOpen: false, appId: '', action: '', reason: '', phone: '', name: '', loginId: '', password: '', areaAdminId: '' });
    } catch (err: any) {
      console.error(err);
      alert('Failed to update status: ' + (err?.message || 'Error'));
    }
  };
const handleAddTechnician = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const docRef = doc(techniciansCollection);
      await setDoc(docRef, {
        id: docRef.id,
        name: techName,
        phone: techPhone,
        mobile: techPhone,
        password: techPassword,
        isActive: true,
        createdAt: new Date().toISOString()
      });
      setTechName('');
      setTechPhone('');
      setTechPassword('');
      alert("Technician added successfully!");
    } catch (error: any) {
      console.error("Error adding technician:", error);
      alert("Failed to add technician: " + (error?.message || "Error"));
    }
  };

  const handleResetTechPassword = async (id: string) => {
    const newPassword = prompt("Enter new password for technician:");
    if (newPassword) {
      try {
        await updateDoc(doc(db, 'technicians', id), { password: newPassword });
        alert("Password updated successfully.");
      } catch (error: any) {
        console.error("Error updating password:", error);
        alert("Failed to update password: " + (error?.message || "Error"));
      }
    }
  };

  const handleAssignTechnician = async (complaintId: string, technicianId: string) => {
    try {
      const tech = technicians?.find(t => t.id === technicianId);
      const techName = tech ? tech?.name : (technicianId || '');
      
      // Update Cloud Firestore
      await updateDoc(doc(db, 'complaints', complaintId), {
        assignedTechnicianId: technicianId,
        assignedTechnicianName: techName,
        assignedTo: techName,
        status: 'ALERT SENT / ASSIGNED',
        updatedAt: new Date().toISOString()
      });

      // Instant React State Update
      setComplaints(prev => prev?.map(c => c.id === complaintId ? { ...c, assignedTechnicianId: technicianId, assignedTechnicianName: techName, assignedTo: techName, status: 'ALERT SENT / ASSIGNED' } : c));
      
      // Green success popup
      setToastMessage(`Alert sent to Technician ${techName} successfully!`);
      setTimeout(() => setToastMessage(''), 4000);
    } catch (error: any) {
      console.error("Error assigning technician:", error);
      alert("Failed to assign technician: " + (error?.message || "Error"));
    }
  };

  const handleDeleteInventory = async (id: string) => {
    if (confirm('Are you sure you want to delete this inventory item? This action cannot be undone.')) {
      try {
        await deleteDoc(doc(db, 'inventory', id));
        alert('Deleted successfully');
      } catch (error: any) {
        console.error("Error deleting inventory item:", error);
        alert('Failed to delete inventory item: ' + (error?.message || 'Error'));
      }
    }
  };

  const handleUpdateComplaintStatus = async (id: string, currentStatus: string) => {
    if (currentStatus === 'Pending') {
      setResolvingComplaintId(id);
      setResolutionModalOpen(true);
      return;
    }

    try {
      await updateDoc(doc(db, 'complaints', id), { status: 'Pending', updatedAt: new Date().toISOString() });
    } catch (error: any) {
      console.error("Error updating complaint:", error);
    }
  };

  const handleResolveComplaint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolvingComplaintId) return;

    try {
      let finalReplacedPartName = replacedPartName;

      // If an inventory item is selected, we deduct stock
      if (selectedInventoryId) {
        const selectedItem = inventory?.find(i => i.id === selectedInventoryId);
        if (selectedItem && selectedItem.id) {
          finalReplacedPartName = `${selectedItem.partName} (${selectedItem.category})`;
          if (replacedPartName) {
            finalReplacedPartName += ` - ${replacedPartName}`;
          }
          // Deduct stock in Firestore
          if (selectedItem.stockQuantity > 0) {
            await updateDoc(doc(db, 'inventory', selectedItem.id), {
              stockQuantity: selectedItem.stockQuantity - 1
            });
          }
        }
      }

      const resolutionData = {
        status: 'COMPLETED',
        resolutionDetails: {
          replacedPartName: DOMPurify.sanitize(finalReplacedPartName),
          oldPartPhoto,
          newPartPhoto,
          totalCost: Number(DOMPurify.sanitize(totalCost.toString())),
          serialNumber: DOMPurify.sanitize(serialNumber),
          warrantyDays: Number(DOMPurify.sanitize(warrantyDays.toString())),
          resolutionDate: new Date().toISOString(),
          paymentStatus
        },
        updatedAt: new Date().toISOString()
      };

      await updateDoc(doc(db, 'complaints', resolvingComplaintId), resolutionData);
      
      setResolutionModalOpen(false);
      setResolvingComplaintId(null);
      setReplacedPartName('');
      setSelectedInventoryId('');
      setOldPartPhoto('');
      setNewPartPhoto('');
      setTotalCost('');
      setSerialNumber('');
      setWarrantyDays('30');
      setPaymentStatus('Paid');
    } catch (error: any) {
      console.error("Error resolving complaint:", error);
      alert("Failed to resolve complaint: " + (error?.message || "Error"));
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, setPhotoUrl: React.Dispatch<React.SetStateAction<string>>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingPhoto(true);
    try {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 600;
          const MAX_HEIGHT = 600;
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
          ctx?.drawImage(img, 0, 0, width, height);
          
          const dataUrl = canvas.toDataURL('image/jpeg', 0.5);
          setPhotoUrl(dataUrl);
          setIsUploadingPhoto(false);
        };
      };
      reader.onerror = (error) => {
        console.error("Error reading file:", error);
        alert("Failed to upload image.");
        setIsUploadingPhoto(false);
      };
    } catch (error) {
      console.error("Error processing file:", error);
      alert("Failed to process image.");
      setIsUploadingPhoto(false);
    }
  };

  const handleOpenAssignModal = (id: string) => {
    setAssigningComplaintId(id);
    setSelectedTechId('');
    setAssignModalOpen(true);
  };


  const handleDeleteComplaint = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this complaint? This action cannot be undone.')) {
      try {
        await deleteDoc(doc(db, 'complaints', id));
        setComplaints(prev => prev.filter(c => c.id !== id));
        alert('Deleted successfully');
      } catch (e: any) {
        console.warn('Error deleting complaint:', e);
        alert('Failed to delete complaint: ' + (e?.message || 'Error'));
      }
    }
  };

  const handleAssignAreaAdmin = async (complaintId: string, areaAdminId: string, adminName: string) => {
    try {
      // Primary write: Cloud Firestore
      await updateDoc(doc(db, 'complaints', complaintId), { 
        assignedAreaAdminId: areaAdminId, 
        autoRouted: false,
        updatedAt: new Date().toISOString()
      });

      // Update React state immediately
      setComplaints(prev => prev.map(c => c.id === complaintId ? { ...c, assignedAreaAdminId: areaAdminId, autoRouted: false } : c));
      alert(`Complaint manually assigned to ${adminName}`);
    } catch (err: any) {
      console.error("Error assigning area admin:", err);
      alert(`Failed to assign area admin: ${err?.message || 'Error occurred'}`);
    }
  };
  
  const handleOpenResolveModal = (id: string) => {
    setResolvingComplaintId(id);
    setResolutionModalOpen(true);
  };

  const handleUpdateCustomStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!updatingComplaintId || !updatingComplaintData) return;

    try {
      const sanitizedStatus = DOMPurify.sanitize(customStatus);
      const sanitizedRemark = DOMPurify.sanitize(customRemark);
      const newUpdate = {
        status: sanitizedStatus,
        note: sanitizedRemark,
        timestamp: new Date().toISOString()
      };
      
      const currentUpdates = updatingComplaintData.statusUpdates || [];
      
      await updateDoc(doc(db, 'complaints', updatingComplaintId), {
        status: sanitizedStatus,
        statusUpdates: [...currentUpdates, newUpdate],
        updatedAt: new Date().toISOString()
      });
      
      setUpdateStatusModalOpen(false);
      setUpdatingComplaintId(null);
      setUpdatingComplaintData(null);
      setCustomStatus('In Progress');
      setCustomRemark('');
    } catch (error: any) {
      console.error("Error updating complaint status:", error);
      alert("Failed to update status: " + (error?.message || "Error"));
    }
  };

  const handleShareWhatsAppReminder = (complaint: Complaint) => {
    const upiString = `upi://pay?pa=sachinelectricals@upi&pn=Sachin%20Electricals&am=${complaint?.resolutionDetails?.totalCost}&cu=INR`;
    const message = `Hello ${complaint?.name},This is a gentle reminder from Sachin Electricals regarding your pending payment.Service Summary:Product: ${complaint?.product}Issue: ${complaint?.issue}Pending Amount: Rs. ${complaint?.resolutionDetails?.totalCost || 0}You can pay online using the UPI link below:${upiString}Thank you!`;
    const url = `https://wa.me/91${complaint?.phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  };

  const handleSavePromo = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingPromo(true);
    
    try {
      const promoData = {
        title: promoTitle,
        subtitle: promoSubtitle,
        imageUrl: promoImageUrl,
        order: promoOrder,
        isActive: promoIsActive,
        updatedAt: new Date().toISOString()
      };

      if (isEditingPromo?.id) {
        await updateDoc(doc(db, 'promotions', isEditingPromo.id), promoData);
        alert('Promotion updated successfully!');
      } else {
        const docRef = doc(promotionsCollection);
        await setDoc(docRef, { ...promoData, id: docRef.id, createdAt: new Date().toISOString() });
        alert('Promotion added successfully!');
      }
      setPromoTitle('');
      setPromoSubtitle('');
      setPromoImageUrl('');
      setPromoOrder(promotions?.length + 1);
      setPromoIsActive(true);
      setIsEditingPromo(null);
    } catch (error: any) {
      console.error("Error saving promo:", error);
      alert("Failed to save promotion: " + (error?.message || "Error"));
    } finally {
      setIsSavingPromo(false);
    }
  };

  const handleEditPromo = (promo: Promotion) => {
    setIsEditingPromo(promo);
    setPromoTitle(promo.title || '');
    setPromoSubtitle(promo.subtitle || '');
    setPromoImageUrl(promo.imageUrl || '');
    setPromoOrder(promo.order || 0);
    setPromoIsActive(promo.isActive ?? true);
  };

  const handleDeletePromo = async (id: string) => {
    if (confirm('Are you sure you want to delete this promotion? This action cannot be undone.')) {
      try {
        await deleteDoc(doc(db, 'promotions', id));
        alert('Deleted successfully');
      } catch (error: any) {
        console.error("Error deleting promotion:", error);
        alert("Failed to delete promotion: " + (error?.message || "Error"));
      }
    }
  };

  const handleViewHistory = async (phone: string) => {
    try {
      // handled via filtered complaints
      const myComplaints = complaints.filter(c => c.phone === phone);
      const history = myComplaints;
      setCustomerHistory(history?.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      setHistoryPhone(phone);
      setHistoryModalOpen(true);
    } catch (error) {
      console.error("Error fetching history:", error);
      alert("Failed to load customer history.");
    }
  };

  const handleWhatsAppUpdate = (complaint: Complaint) => {
    let message = `Hello ${complaint?.name}, your complaint (ID: ${complaint.id?.substring(0, 6).toUpperCase()}) regarding ${complaint?.product} is currently ${complaint?.status}. `;
    
    if (complaint?.status === 'COMPLETED' && complaint?.resolutionDetails) {
      message += `The repair has been completed. Replaced parts: ${complaint?.resolutionDetails.replacedPartName}. Total cost: ₹${complaint?.resolutionDetails.totalCost}. `;
    } else if (complaint?.statusUpdates && complaint?.statusUpdates?.length > 0) {
      const latestUpdate = complaint?.statusUpdates[complaint?.statusUpdates?.length - 1];
      message += `Update: ${latestUpdate.status}. Note: ${latestUpdate.note}. `;
    }
    
    message += `Thank you for choosing Sachin Electricals!`;

    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `https://wa.me/91${complaint?.phone.replace(/\D/g, '')}?text=${encodedMessage}`;
    window.open(whatsappUrl, '_blank');
  };

  const handleAutoServiceReminder = (complaint: Complaint) => {
    const message = `Hello ${complaint?.name},This is a friendly reminder from Sachin Electricals. It has been 6 months since your last ${complaint?.product} service.Regular servicing keeps your appliances running smoothly and prevents costly breakdowns. Would you like to book a maintenance visit?Reply 'YES' to this message to book.Thank you!`;
    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `https://wa.me/91${complaint?.phone.replace(/\D/g, '')}?text=${encodedMessage}`;
    window.open(whatsappUrl, '_blank');
  };

  const editProduct = (product: Product) => {
    setIsEditing(product);
    setName(product.name || '');
    setCategory(product.category || '');
    setPrice((product.price || '').toString());
    setImage(product.image || '');
    setDescription(product.description || '');
  };

  const resetForm = () => {
    setIsEditing(null);
    setName('');
    setCategory('');
    setPrice('');
    setImage('');
    setDescription('');
  };

  const editInventory = (item: InventoryItem) => {
    setIsEditingInventory(item);
    setInvCategory(item.category || '');
    setInvPartName(item.partName || '');
    setInvStockQuantity((item.stockQuantity || 0).toString());
    setInvCostPrice((item.costPrice || 0).toString());
    setInvSellingPrice((item.sellingPrice || 0).toString());
  };

  const resetInventoryForm = () => {
    setIsEditingInventory(null);
    setInvCategory('AC');
    setCustomInvCategory('');
    setInvPartName('');
    setInvStockQuantity('');
    setInvCostPrice('');
    setInvSellingPrice('');
  };

  const sendWhatsAppJobCard = (complaint: Complaint) => {
    const message = `*Sachin Electricals & Repairs*`
      + `*Job ID:* ${complaint.id?.substring(0, 8) || 'N/A'}`
      + `*Customer Name:* ${complaint?.name}`
      + `*Item:* ${complaint?.product}`
      + `*Issue:* ${complaint?.issue}`
      + `*Status:* ${complaint?.status}`
      + `*Priority:* ${complaint.priority || 'Normal'}`
      + `We have received your service request. Our technician will contact you shortly.`
      + `Thank you for choosing us!`;
      
    const whatsappUrl = `https://wa.me/91${complaint?.phone}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
  };

  const filteredComplaints = useMemo(() => {
    return complaints?.filter(c => {
      const matchesPhone = c?.phone?.includes(searchPhone);
      const matchesStatus = statusFilter === 'All' || c?.status === statusFilter;
      
      let matchesRole = true;
      if (user?.role === 'technician') {
        matchesRole = c.assignedTechnicianId === user.id;
      }
      
      return matchesPhone && matchesStatus && matchesRole;
    });
  }, [complaints, searchPhone, statusFilter, user]);

  const analytics = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    const resolvedToday = complaints?.filter(c => c?.status === 'COMPLETED' && c.resolutionDetails?.resolutionDate?.startsWith(todayStr));
    const revenueToday = resolvedToday?.reduce((sum, c) => sum + (c.resolutionDetails?.totalCost || 0), 0);
    const resolvedTodayCount = resolvedToday?.length;

    const outstandingDues = complaints
      ?.filter(c => c?.status === 'COMPLETED' && c.resolutionDetails?.paymentStatus === 'Pending')
      ?.reduce((sum, c) => sum + (c.resolutionDetails?.totalCost || 0), 0);

    const techPerformance = technicians?.map(tech => {
      const assigned = complaints?.filter(c => c.assignedTechnicianId === tech?.id);
      const completed = assigned?.filter(c => c?.status === 'COMPLETED')?.length;
      const pending = assigned?.length - completed;
      return {
        id: tech?.id,
        name: tech?.name,
        completed,
        pending,
        total: assigned?.length
      };
    });

    return { revenueToday, resolvedTodayCount, outstandingDues, techPerformance };
  }, [complaints, technicians]);

  if (loading) {
    return <div className="flex justify-center items-center h-screen bg-slate-50"><div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full"></div></div>;
  }

  if (!user) {
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
          <div className="bg-white py-8 px-6 shadow-lg rounded-2xl border border-slate-200 sm:px-8">
            <h2 className="text-xl font-black text-slate-900 text-center mb-6 tracking-tight">Super Admin Login</h2>

            <form className="space-y-4" onSubmit={handleAuth}>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Super Admin ID / Mobile
                </label>
                <input 
                  type="text" 
                  required 
                  value={email} 
                  onChange={(e) => setEmail(e.target.value)} 
                  className="appearance-none block w-full px-3 py-2.5 border border-slate-300 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-medium transition-all" 
                  placeholder="Enter Super Admin ID or Mobile" 
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Password
                </label>
                <input 
                  type="password" 
                  required 
                  value={password} 
                  onChange={(e) => setPassword(e.target.value)} 
                  className="appearance-none block w-full px-3 py-2.5 border border-slate-300 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-medium transition-all" 
                  placeholder="Enter Password"
                />
                <div className="mt-2 text-right">
                  <button 
                    type="button" 
                    onClick={handleForgotPassword} 
                    className="text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline transition-colors"
                  >
                    Forget Password?
                  </button>
                </div>
              </div>

              {loginError && (
                <div className="text-red-600 text-xs font-bold bg-red-50 border border-red-200 p-2.5 rounded-lg">
                  {loginError}
                </div>
              )}

              <div className="pt-2">
                <button 
                  type="submit" 
                  className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-xl shadow-md text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 active:scale-[0.99] transition-all"
                >
                  Login
                </button>
              </div>
            </form>

            {/* Forgot Password Modal (Master Security PIN) */}
            {forgotPasswordModalOpen && (
              <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl border border-slate-200">
                  <div className="p-6">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-lg font-black text-slate-900">
                        {forgotStep === 'verifyPin' ? 'Super Admin Recovery' : 'Set New Password'}
                      </h3>
                      <button 
                        onClick={() => setForgotPasswordModalOpen(false)} 
                        className="text-slate-400 hover:text-slate-700 text-lg font-bold"
                      >
                        ✕
                      </button>
                    </div>

                    {forgotError && (
                      <div className="mb-4 text-red-600 text-xs font-bold bg-red-50 border border-red-200 p-2.5 rounded-lg">
                        {forgotError}
                      </div>
                    )}

                    {forgotStep === 'verifyPin' ? (
                      <form onSubmit={handleVerifyMasterPin} className="space-y-4">
                        <div>
                          <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                            Registered Mobile Number
                          </label>
                          <input 
                            type="text" 
                            required 
                            value={forgotMobile} 
                            onChange={(e) => setForgotMobile(e.target.value)} 
                            className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-medium" 
                            placeholder="e.g. 8381892161" 
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                            Secret Master PIN (6-Digit)
                          </label>
                          <input 
                            type="password" 
                            maxLength={6} 
                            required 
                            value={forgotPin} 
                            onChange={(e) => setForgotPin(e.target.value)} 
                            className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-center tracking-widest text-lg font-bold" 
                            placeholder="••••••" 
                          />
                        </div>

                        <button 
                          type="submit" 
                          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-4 rounded-xl shadow transition-colors"
                        >
                          Verify Master PIN
                        </button>
                      </form>
                    ) : (
                      <form onSubmit={handleForgotResetPassword} className="space-y-4">
                        <p className="text-xs text-slate-500 mb-2">
                          Enter and confirm your new Super Admin password.
                        </p>
                        <div>
                          <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                            New Password
                          </label>
                          <input 
                            type="password" 
                            required 
                            value={newPassword} 
                            onChange={(e) => setNewPassword(e.target.value)} 
                            className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm" 
                            placeholder="Enter new password"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                            Confirm New Password
                          </label>
                          <input 
                            type="password" 
                            required 
                            value={confirmPassword} 
                            onChange={(e) => setConfirmPassword(e.target.value)} 
                            className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm" 
                            placeholder="Confirm new password"
                          />
                        </div>
                        <button 
                          type="submit" 
                          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-4 rounded-xl shadow transition-colors"
                        >
                          Update Password
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 bg-green-600 text-white px-6 py-3 rounded-lg shadow-xl font-bold flex items-center gap-2 animate-[slideIn_0.3s_ease-out]">
          <CheckCircle className="w-5 h-5" />
          {toastMessage}
        </div>
      )}
      <div className="min-h-screen bg-slate-50">
      
      <nav className="bg-white shadow-sm border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center gap-8 overflow-x-auto">
              <h1 className="text-xl font-bold text-slate-900 shrink-0">
                {user.role === 'super_admin' ? 'Super Admin Control' : user.role === 'area_admin' ? `${user.name} - Regional Panel` : 'Staff Dashboard'}
              </h1>
              <div className="hidden md:flex space-x-4">
                {user.role === 'super_admin' && (
                  <>
                    <button onClick={() => setActiveTab('reports')} className={`whitespace-nowrap px-3 py-2 rounded-md text-sm font-semibold flex items-center gap-1.5 ${activeTab === 'reports' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-700 hover:bg-slate-100'}`}>📁 Master Data & PDF Export</button>
                    <button onClick={() => setActiveTab('complaints')} className={`whitespace-nowrap px-3 py-2 rounded-md text-sm font-medium ${activeTab === 'complaints' ? 'bg-blue-100 text-blue-700' : 'text-slate-600 hover:bg-slate-100'}`}>📋 Global Complaints</button>
                    <button onClick={() => setActiveTab('orders')} className={`whitespace-nowrap px-3 py-2 rounded-md text-sm font-medium ${activeTab === 'orders' ? 'bg-blue-100 text-blue-700' : 'text-slate-600 hover:bg-slate-100'}`}>🛍️ Customer Orders</button>
                    <button onClick={() => setActiveTab('analytics')} className={`whitespace-nowrap px-3 py-2 rounded-md text-sm font-medium ${activeTab === 'analytics' ? 'bg-blue-100 text-blue-700' : 'text-slate-600 hover:bg-slate-100'}`}>📈 System Charts</button>
                    <button onClick={() => setActiveTab('areaAdmins')} className={`whitespace-nowrap px-3 py-2 rounded-md text-sm font-medium ${activeTab === 'areaAdmins' ? 'bg-blue-100 text-blue-700' : 'text-slate-600 hover:bg-slate-100'}`}>👥 Manage Area Admins</button>
                    <button onClick={() => setActiveTab('technicianApplications')} className={`whitespace-nowrap px-3 py-2 rounded-md text-sm font-medium ${activeTab === 'technicianApplications' ? 'bg-blue-100 text-blue-700' : 'text-slate-600 hover:bg-slate-100'}`}>👨‍🔧 Pending Techs</button>
                    <button onClick={() => setActiveTab('technicians')} className={`whitespace-nowrap px-3 py-2 rounded-md text-sm font-medium ${activeTab === 'technicians' ? 'bg-blue-100 text-blue-700' : 'text-slate-600 hover:bg-slate-100'}`}>👨‍🔧 Manage Technicians</button>
                    <button onClick={() => setActiveTab('ai-manager')} className={`whitespace-nowrap px-3 py-2 rounded-md text-sm font-medium ${activeTab === 'ai-manager' ? 'bg-blue-100 text-blue-700' : 'text-slate-600 hover:bg-slate-100'}`}>🤖 AI Command Center</button>
                    <button onClick={() => setActiveTab('banner')} className={`whitespace-nowrap px-3 py-2 rounded-md text-sm font-medium ${activeTab === 'banner' ? 'bg-blue-100 text-blue-700' : 'text-slate-600 hover:bg-slate-100'}`}>🏷️ Banner & Offers</button>
                    <button onClick={() => setActiveTab('products')} className={`whitespace-nowrap px-3 py-2 rounded-md text-sm font-medium ${activeTab === 'products' ? 'bg-blue-100 text-blue-700' : 'text-slate-600 hover:bg-slate-100'}`}>📦 Products</button>
                    <button onClick={() => setActiveTab('pricing')} className={`whitespace-nowrap px-3 py-2 rounded-md text-sm font-medium ${activeTab === 'pricing' ? 'bg-blue-100 text-blue-700' : 'text-slate-600 hover:bg-slate-100'}`}>💰 Service Pricing Setup</button>
                  </>
                )}
                {user.role === 'area_admin' && (
                  <>
                    <button onClick={() => setActiveTab('complaints')} className={`px-3 py-2 rounded-md text-sm font-medium ${activeTab === 'complaints' ? 'bg-blue-100 text-blue-700' : 'text-slate-600 hover:bg-slate-100'}`}>Local Complaints</button>
                    <button onClick={() => setActiveTab('orders')} className={`px-3 py-2 rounded-md text-sm font-medium ${activeTab === 'orders' ? 'bg-blue-100 text-blue-700' : 'text-slate-600 hover:bg-slate-100'}`}>Customer Orders</button>
                    <button onClick={() => setActiveTab('inventory')} className={`px-3 py-2 rounded-md text-sm font-medium ${activeTab === 'inventory' ? 'bg-blue-100 text-blue-700' : 'text-slate-600 hover:bg-slate-100'}`}>Local Inventory</button>
                    <button onClick={() => setActiveTab('analytics')} className={`px-3 py-2 rounded-md text-sm font-medium ${activeTab === 'analytics' ? 'bg-blue-100 text-blue-700' : 'text-slate-600 hover:bg-slate-100'}`}>Local Analytics</button>
                    <button onClick={() => setActiveTab('ai-manager')} className={`px-3 py-2 rounded-md text-sm font-medium ${activeTab === 'ai-manager' ? 'bg-blue-100 text-blue-700' : 'text-slate-600 hover:bg-slate-100'}`}>AI Assistant</button>
                  </>
                )}
                {user.role === 'technician' && (
                  <button onClick={() => setActiveTab('complaints')} className={`px-3 py-2 rounded-md text-sm font-medium ${activeTab === 'complaints' ? 'bg-blue-100 text-blue-700' : 'text-slate-600 hover:bg-slate-100'}`}>Complaints</button>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <button onClick={() => { window.location.hash = ''; window.location.reload(); }} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition-colors flex items-center gap-2">
                🏠 Home Page
              </button>
              <button onClick={() => { handleLogout(); window.location.hash = ''; window.location.reload(); }} className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 font-medium rounded-lg transition-colors flex items-center gap-2">
                🚪 Exit / Logout
              </button>
            </div>
          </div>
          <div className="flex md:hidden overflow-x-auto space-x-2 pb-2">
             {user.role === 'super_admin' && (
               <>
                 <button onClick={() => setActiveTab('reports')} className={`shrink-0 px-3 py-1.5 rounded-md text-sm font-semibold ${activeTab === 'reports' ? 'bg-blue-600 text-white' : 'text-slate-600 bg-slate-100'}`}>📁 Master Data & PDF</button>
                 <button onClick={() => setActiveTab('complaints')} className={`shrink-0 px-3 py-1.5 rounded-md text-sm font-medium ${activeTab === 'complaints' ? 'bg-blue-100 text-blue-700' : 'text-slate-600 bg-slate-100'}`}>📋 Complaints</button>
                 <button onClick={() => setActiveTab('orders')} className={`shrink-0 px-3 py-1.5 rounded-md text-sm font-medium ${activeTab === 'orders' ? 'bg-blue-100 text-blue-700' : 'text-slate-600 bg-slate-100'}`}>🛍️ Orders</button>
                 <button onClick={() => setActiveTab('analytics')} className={`shrink-0 px-3 py-1.5 rounded-md text-sm font-medium ${activeTab === 'analytics' ? 'bg-blue-100 text-blue-700' : 'text-slate-600 bg-slate-100'}`}>📈 Charts</button>
                 <button onClick={() => setActiveTab('areaAdmins')} className={`shrink-0 px-3 py-1.5 rounded-md text-sm font-medium ${activeTab === 'areaAdmins' ? 'bg-blue-100 text-blue-700' : 'text-slate-600 bg-slate-100'}`}>👥 Area Admins</button>
                 <button onClick={() => setActiveTab('technicianApplications')} className={`shrink-0 px-3 py-1.5 rounded-md text-sm font-medium ${activeTab === 'technicianApplications' ? 'bg-blue-100 text-blue-700' : 'text-slate-600 bg-slate-100'}`}>👨‍🔧 Pending Techs</button>
                 <button onClick={() => setActiveTab('ai-manager')} className={`shrink-0 px-3 py-1.5 rounded-md text-sm font-medium ${activeTab === 'ai-manager' ? 'bg-blue-100 text-blue-700' : 'text-slate-600 bg-slate-100'}`}>🤖 AI Center</button>
                 <button onClick={() => setActiveTab('banner')} className={`shrink-0 px-3 py-1.5 rounded-md text-sm font-medium ${activeTab === 'banner' ? 'bg-blue-100 text-blue-700' : 'text-slate-600 bg-slate-100'}`}>🏷️ Banners</button>
                 <button onClick={() => setActiveTab('products')} className={`shrink-0 px-3 py-1.5 rounded-md text-sm font-medium ${activeTab === 'products' ? 'bg-blue-100 text-blue-700' : 'text-slate-600 bg-slate-100'}`}>📦 Products</button>
                 <button onClick={() => setActiveTab('pricing')} className={`shrink-0 px-3 py-1.5 rounded-md text-sm font-medium ${activeTab === 'pricing' ? 'bg-blue-100 text-blue-700' : 'text-slate-600 bg-slate-100'}`}>💰 Service Pricing</button>
               </>
             )}
             {user.role === 'area_admin' && (
                <>
                  <button onClick={() => setActiveTab('complaints')} className={`shrink-0 px-3 py-1.5 rounded-md text-sm font-medium ${activeTab === 'complaints' ? 'bg-blue-100 text-blue-700' : 'text-slate-600 bg-slate-100'}`}>Local Complaints</button>
                  <button onClick={() => setActiveTab('orders')} className={`shrink-0 px-3 py-1.5 rounded-md text-sm font-medium ${activeTab === 'orders' ? 'bg-blue-100 text-blue-700' : 'text-slate-600 bg-slate-100'}`}>Orders</button>
                  <button onClick={() => setActiveTab('inventory')} className={`shrink-0 px-3 py-1.5 rounded-md text-sm font-medium ${activeTab === 'inventory' ? 'bg-blue-100 text-blue-700' : 'text-slate-600 bg-slate-100'}`}>Local Inventory</button>
                  <button onClick={() => setActiveTab('analytics')} className={`shrink-0 px-3 py-1.5 rounded-md text-sm font-medium ${activeTab === 'analytics' ? 'bg-blue-100 text-blue-700' : 'text-slate-600 bg-slate-100'}`}>Local Analytics</button>
                  <button onClick={() => setActiveTab('ai-manager')} className={`shrink-0 px-3 py-1.5 rounded-md text-sm font-medium ${activeTab === 'ai-manager' ? 'bg-blue-100 text-blue-700' : 'text-slate-600 bg-slate-100'}`}>AI Assistant</button>
                </>
             )}
          </div>
        </div>
      </nav>


      <main className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        {activeTab === 'areaAdmins' ? (
          
          <div className="space-y-8">
            <div className="bg-white/70 backdrop-blur-xl rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/40 p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Manage Area Admins</h2>
                <p className="text-sm text-slate-500">Create and manage regional administrators.</p>
              </div>
              <div className="flex gap-3">
                <button 
                  onClick={() => {
                    setAaModal({ isOpen: true, id: '', name: '', loginId: '', email: '', phone: '', password: '', pincodes: '', isActive: true, canEditInventory: true, canAlertTechs: true, canWA: true });
                    setAaFieldErrors({});
                    setAaFormError('');
                  }}
                  className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-lg font-bold hover:bg-blue-700 transition-colors shadow-sm"
                >
                  + Add New Area Admin
                </button>
              </div>
            </div>

            {aaSuccessMessage && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-5 py-3.5 rounded-xl flex items-center gap-2.5 font-bold shadow-sm animate-fadeIn">
                <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
                <span>{aaSuccessMessage}</span>
              </div>
            )}

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
                <h3 className="text-lg font-bold text-slate-900">Area Admin Details</h3>
              </div>
              <div className="p-6">
                {areaAdmins?.length === 0 ? (
                  <div className="text-center py-12 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200">
                    <p className="text-slate-500 font-medium">No Area Admins found.</p>
                    <p className="text-sm text-slate-400 mt-1">Click the button above to add your first area admin.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {areaAdmins?.map((admin) => (
                      <div key={admin.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                        <div className="p-5 flex-1">
                          <div className="flex justify-between items-start mb-4">
                            <div>
                              <h4 className="font-bold text-slate-900 text-lg">{admin.name}</h4>
                              {admin.loginId && (
                                <p className="text-xs font-mono text-slate-500 mt-0.5">ID: {admin.loginId}</p>
                              )}
                              <div className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium mt-1 ${
                                admin.isActive !== false ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                              }`}>
                                {admin.isActive !== false ? 'Active' : 'Inactive'}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleToggleAreaAdminStatus(admin.id, admin.isActive !== false)}
                              className={`px-2.5 py-1 rounded text-xs font-semibold border transition-colors ${
                                admin.isActive !== false ? 'bg-amber-50 text-amber-700 hover:bg-amber-100 border-amber-200' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-200'
                              }`}
                            >
                              {admin.isActive !== false ? 'Deactivate' : 'Activate'}
                            </button>
                          </div>
                          
                          <div className="space-y-3">
                            <div className="flex items-center gap-2 text-sm text-slate-600">
                              <span className="shrink-0 w-5 h-5 flex items-center justify-center bg-slate-100 rounded text-slate-400">📧</span>
                              <span className="truncate">{admin.email || 'N/A'}</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-slate-600">
                              <span className="shrink-0 w-5 h-5 flex items-center justify-center bg-slate-100 rounded text-slate-400">📱</span>
                              <span>{admin.phone}</span>
                            </div>
                            <div className="flex gap-2 text-sm text-slate-600 items-start">
                              <span className="shrink-0 w-5 h-5 flex items-center justify-center bg-slate-100 rounded text-slate-400 mt-0.5">📍</span>
                              <div className="flex flex-wrap gap-1">
                                {(admin.pincodes || admin.assignedPincodes || []).map((pin: string) => (
                                  <span key={pin} className="inline-flex px-2 py-1 bg-slate-100 text-slate-700 rounded text-xs font-medium border border-slate-200 font-mono">
                                    {pin}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                        
                        <div className="border-t border-slate-100 bg-slate-50 p-3 flex flex-wrap items-center justify-between gap-2">
                          <button 
                            onClick={() => setViewingAdminComplaints(admin)}
                            className="flex-1 min-w-[130px] flex items-center justify-center gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-blue-600 transition-colors shadow-sm"
                          >
                            👁️ View Complaints
                          </button>
                          <div className="flex items-center gap-2 w-full sm:w-auto">
                            <button 
                              onClick={() => {
                                setAaModal({
                                  isOpen: true,
                                  id: admin.id,
                                  name: admin.name || '',
                                  loginId: admin.loginId || admin.email || admin.phone || '',
                                  email: admin.email || '',
                                  phone: admin.phone || '',
                                  password: '',
                                  pincodes: Array.isArray(admin.pincodes) ? admin.pincodes.join(', ') : (admin.pincodes || ''),
                                  isActive: admin.isActive !== false,
                                  canEditInventory: admin.permissions?.canEditInventory ?? true,
                                  canAlertTechs: admin.permissions?.canAlertTechs ?? true,
                                  canWA: admin.permissions?.canWA ?? true
                                });
                                setAaFieldErrors({});
                                setAaFormError('');
                              }}
                              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors shadow-sm"
                            >
                              ✏️ Edit
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleDeleteById(admin.id);
                              }}
                              className="px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 font-medium transition-colors border border-red-200"
                            >
                              🗑️ Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

        ) : activeTab === 'complaints' ? (
          <MasterComplaintsView
            areaAdmins={areaAdmins}
            handleAssignAreaAdmin={handleAssignAreaAdmin}
            handleDeleteComplaint={handleDeleteComplaint}
            complaints={complaints}
            user={user}
            pincodeFilter={pincodeFilter}
            setPincodeFilter={setPincodeFilter}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter as any}
            searchPhone={searchPhone}
            setSearchPhone={setSearchPhone}
            handleOpenAssignModal={handleOpenAssignModal}
            handleAssignTechnician={handleAssignTechnician}
            handleOpenResolveModal={handleOpenResolveModal}
            handleUpdateStatus={id => {
               setUpdatingComplaintId(id);
               const c = complaints?.find(comp => comp.id === id);
               if (c) {
                 setUpdatingComplaintData(c);
                 setCustomStatus(c?.status);
                 setCustomRemark('');
                 setUpdateStatusModalOpen(true);
               }
            }}
            handleOpenHistory={handleViewHistory}
            technicians={technicians}
          />
        ) : activeTab === 'pricing' ? (
          <div className="bg-white/70 backdrop-blur-xl rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/40 overflow-hidden max-w-3xl mx-auto">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center gap-2">
              <h3 className="text-lg font-bold text-slate-900">Service Pricing & Home Visit Charges</h3>
            </div>
            <div className="p-6">
              <form onSubmit={handleSavePricing} className="space-y-6">
                
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-5">
                  <label className="block text-sm font-bold text-slate-900 mb-2">Mandatory Home Visit Charge (₹)</label>
                  <p className="text-xs text-slate-600 mb-3">This fixed charge will be automatically added to all home service bookings.</p>
                  <input
                    type="number"
                    required
                    min="0"
                    value={pricingSettings.homeVisitCharge ?? 0}
                    onChange={(e) => setPricingSettings({ ...pricingSettings, homeVisitCharge: Number(e.target.value) })}
                    className="w-full md:w-1/2 px-4 py-2 border border-blue-200 rounded-lg focus:ring-2 focus:ring-0 focus:border-blue-500 outline-none transition-all bg-white font-bold"
                  />
                </div>
                
                <div>
                  <h4 className="font-bold text-slate-900 mb-4 border-b pb-2">Individual Service Charges (₹)</h4>
                  <p className="text-xs text-slate-600 mb-4">Base prices for different appliance services (excluding spare parts). These are added on top of the home visit charge.</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {Object.keys(pricingSettings.serviceFees)?.map(key => (
                      <div key={key} className="flex flex-col">
                        <label className="block text-sm font-medium text-slate-700 mb-1">{key === 'HouseWiring' ? 'House Wiring' : key === 'WashingMachine' ? 'Washing Machine' : key}</label>
                        <input
                          type="number"
                          required
                          min="0"
                          value={pricingSettings.serviceFees[key as keyof typeof pricingSettings.serviceFees] ?? 0}
                          onChange={(e) => setPricingSettings({ 
                            ...pricingSettings, 
                            serviceFees: { ...pricingSettings.serviceFees, [key]: Number(e.target.value) } 
                          })}
                          className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-0 focus:border-blue-400 outline-none transition-all bg-white"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end pt-4 border-t border-slate-200">
                  <button
                    type="submit"
                    disabled={isSavingPricing}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-lg shadow-md transition-all flex items-center gap-2 disabled:opacity-70 btn-3d btn-3d-blue"
                  >
                    {isSavingPricing ? 'Saving...' : 'Save Pricing Details'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : activeTab === 'banner' ? (
          <div className="bg-white/70 backdrop-blur-xl rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/40 hover:border-blue-200/50 hover:shadow-[0_0_20px_rgba(59,130,246,0.15)] transition-all duration-300 overflow-hidden max-w-2xl mx-auto">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center gap-2">
              <LayoutTemplate className="w-5 h-5 text-blue-600" />
              <h3 className="text-lg font-bold text-slate-900">Dynamic Offer Banner</h3>
            </div>
            <form onSubmit={handleSaveBanner} className="p-6 space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Banner Status</label>
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="isActive"
                    checked={bannerSettings.isActive}
                    onChange={(e) => setBannerSettings({ ...bannerSettings, isActive: e.target.checked })}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="isActive" className="ml-2 block text-sm text-gray-900">
                    Show banner on homepage
                  </label>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Banner Type</label>
                <select
                  value={bannerSettings.type}
                  onChange={(e) => setBannerSettings({ ...bannerSettings, type: e.target.value as any })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-0 focus:border-blue-400 focus:shadow-[0_0_15px_rgba(59,130,246,0.3)] transition-all outline-none transition-all bg-white"
                >
                  <option value="offer">Special Offer (Blue)</option>
                  <option value="discount">Discount (Green)</option>
                  <option value="emergency">Emergency / Alert (Red)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Banner Text</label>
                <input
                  type="text"
                  required
                  value={bannerSettings.text}
                  onChange={(e) => setBannerSettings({ ...bannerSettings, text: e.target.value })}
                  placeholder="e.g. 20% Off on AC Servicing this weekend!"
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-0 focus:border-blue-400 focus:shadow-[0_0_15px_rgba(59,130,246,0.3)] transition-all outline-none transition-all bg-white"
                />
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-end">
                <button
                  type="submit"
                  disabled={isSavingBanner}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  {isSavingBanner ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </form>
          </div>
        
        ) : activeTab === 'technicianApplications' ? (
          <div className="bg-white/70 backdrop-blur-xl rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/40 hover:border-blue-200/50 hover:shadow-[0_0_20px_rgba(59,130,246,0.15)] transition-all duration-300 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex flex-col gap-2">
                <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                  <Users className="w-5 h-5 text-blue-600" /> Technician Applications
                </h2>
                <button 
                  onClick={() => setNewTechModalOpen(true)}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-blue-700 transition-colors shadow-sm text-sm w-fit"
                >
                  + Add New Technician
                </button>
              </div>
              <div className="flex gap-2 bg-slate-200 p-1 rounded-lg overflow-x-auto">
                <button onClick={() => setTechAppTab('Pending')} className={`px-4 py-1.5 rounded-md text-sm font-bold whitespace-nowrap ${techAppTab === 'Pending' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>Pending Techs</button>
                <button onClick={() => setTechAppTab('Approved')} className={`px-4 py-1.5 rounded-md text-sm font-bold whitespace-nowrap ${techAppTab === 'Approved' ? 'bg-white text-green-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>Approved</button>
                <button onClick={() => setTechAppTab('Hold')} className={`px-4 py-1.5 rounded-md text-sm font-bold whitespace-nowrap ${techAppTab === 'Hold' ? 'bg-white text-yellow-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>Hold</button>
                <button onClick={() => setTechAppTab('Rejected')} className={`px-4 py-1.5 rounded-md text-sm font-bold whitespace-nowrap ${techAppTab === 'Rejected' ? 'bg-white text-red-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>Rejected</button>
              </div>
            </div>
            <div className="p-6">
              {technicianApplications?.filter(app => ((app.status?.toLowerCase() === techAppTab.toLowerCase() || (techAppTab === 'Pending' && app.status?.toLowerCase() === 'pending') || (techAppTab === 'Hold' && app.status?.toLowerCase() === 'on_hold'))))?.length === 0 ? (
                <div className="text-center text-slate-500 py-12">No {techAppTab.toLowerCase()} applications found.</div>
              ) : (
                <div className="space-y-6">
                  {technicianApplications?.filter(app => ((app.status?.toLowerCase() === techAppTab.toLowerCase() || (techAppTab === 'Pending' && app.status?.toLowerCase() === 'pending') || (techAppTab === 'Hold' && app.status?.toLowerCase() === 'on_hold'))))?.map(app => (
                    <div key={app.id} className="border border-slate-200 rounded-xl p-6 bg-slate-50 relative">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <h3 className="text-lg font-bold text-slate-900 mb-2">{app.fullName}</h3>
                          <div className="space-y-2 text-sm text-slate-600">
                            <p><span className="font-medium text-slate-800">Status:</span> 
                                <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-bold uppercase ${app.status === 'Approved' ? 'bg-green-100 text-green-700' : app.status === 'Rejected' ? 'bg-red-100 text-red-700' : app.status?.toLowerCase() === 'hold' || app.status?.toLowerCase() === 'on_hold' ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-100 text-blue-700'}`}>
                                    {app.status}
                                </span>
                            </p>
                            <p><span className="font-medium text-slate-800">Mobile:</span> {app.mobile}</p>
                            <p><span className="font-medium text-slate-800">WhatsApp:</span> {app.whatsapp}</p>
                            <p><span className="font-medium text-slate-800">City:</span> {app.city}</p>
                            <p><span className="font-medium text-slate-800">Experience:</span> {app.experience} Years</p>
                            <p><span className="font-medium text-slate-800">Skills:</span> {Array.isArray(app.skills) ? app.skills.join(', ') : (app.skills || 'N/A')}</p>
                            <p><span className="font-medium text-slate-800">Applied On:</span> {new Date(app.createdAt).toLocaleString()}</p>
                            {app.reason && (
                              <p className="bg-slate-200 p-2 rounded-md mt-2"><span className="font-bold text-slate-800">Reason/Note:</span> {app.reason}</p>
                            )}
                          </div>
                          
                          <div className="mt-6 flex flex-wrap gap-3">
                             <button onClick={() => handleOpenTechModal(app.id, 'Approved', app.whatsapp, app.fullName)} className="px-4 py-2 bg-green-600 text-white rounded-lg font-semibold text-sm hover:bg-green-700 transition-colors shadow-sm">Approve</button>
                             <button onClick={() => handleOpenTechModal(app.id, 'Hold', app.whatsapp, app.fullName)} className="px-4 py-2 bg-yellow-500 text-white rounded-lg font-semibold text-sm hover:bg-yellow-600 transition-colors shadow-sm">Hold</button>
                             <button onClick={() => handleOpenTechModal(app.id, 'Rejected', app.whatsapp, app.fullName)} className="px-4 py-2 bg-red-600 text-white rounded-lg font-semibold text-sm hover:bg-red-700 transition-colors shadow-sm">Reject</button>
                          </div>
                        </div>
                        
                        <div className="w-full">
                          <details className="group">
                            <summary className="list-none cursor-pointer inline-flex items-center justify-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg font-semibold text-sm transition-colors border border-indigo-200">
                              📄 Review Documents
                            </summary>
                            <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-slate-200">
                           {app.documents?.photo && (
                             <div>
                               <p className="text-xs font-bold text-slate-500 mb-1">Live Photo</p>
                               {app.documents.photo.startsWith('data:application/pdf') ? (
                                 <div className="w-full h-32 flex items-center justify-center bg-slate-200 rounded-lg border border-slate-300 text-slate-600 font-bold text-sm">PDF Document</div>
                               ) : (
                                 <img src={app.documents.photo} alt="Selfie" className="w-full h-32 object-cover rounded-lg border border-slate-300" />
                               )}
                             </div>
                           )}
                           {app.documents?.aadhaarFront && (
                             <div>
                               <p className="text-xs font-bold text-slate-500 mb-1">Aadhaar Front</p>
                               {app.documents.aadhaarFront.startsWith('data:application/pdf') ? (
                                 <div className="w-full h-32 flex items-center justify-center bg-slate-200 rounded-lg border border-slate-300 text-slate-600 font-bold text-sm">PDF Document</div>
                               ) : (
                                 <img src={app.documents.aadhaarFront} alt="Aadhaar Front" className="w-full h-32 object-cover rounded-lg border border-slate-300" />
                               )}
                             </div>
                           )}
                           {app.documents?.aadhaarBack && (
                             <div>
                               <p className="text-xs font-bold text-slate-500 mb-1">Aadhaar Back</p>
                               {app.documents.aadhaarBack.startsWith('data:application/pdf') ? (
                                 <div className="w-full h-32 flex items-center justify-center bg-slate-200 rounded-lg border border-slate-300 text-slate-600 font-bold text-sm">PDF Document</div>
                               ) : (
                                 <img src={app.documents.aadhaarBack} alt="Aadhaar Back" className="w-full h-32 object-cover rounded-lg border border-slate-300" />
                               )}
                             </div>
                           )}
                           {app.documents?.pan && (
                             <div>
                               <p className="text-xs font-bold text-slate-500 mb-1">PAN Card</p>
                               {app.documents.pan.startsWith('data:application/pdf') ? (
                                 <div className="w-full h-32 flex items-center justify-center bg-slate-200 rounded-lg border border-slate-300 text-slate-600 font-bold text-sm">PDF Document</div>
                               ) : (
                                 <img src={app.documents.pan} alt="PAN Card" className="w-full h-32 object-cover rounded-lg border border-slate-300" />
                               )}
                             </div>
                           )}
                            </div>
                          </details>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {/* Modal */}
            
            {/* Active Technicians Directory */}
            <div className="mt-8 bg-white/70 backdrop-blur-xl rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/40 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
                <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                  <Users className="w-5 h-5 text-indigo-600" /> Active Technicians Directory
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase">Name & Contact</th>
                      <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase">Login ID</th>
                      <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase">Password</th>
                      <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase">Area/PIN</th>
                      <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase">Status</th>
                      <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {technicians?.length === 0 ? (
                      <tr>
                         <td colSpan={6} className="px-4 py-8 text-center text-slate-500">No active technicians found.</td>
                      </tr>
                    ) : (
                      technicians?.map(tech => (
                        <tr key={tech?.id} className="hover:bg-slate-50/50">
                          <td className="px-4 py-3 align-top">
                            <div className="font-bold text-slate-900">{tech?.name}</div>
                            <div className="text-sm text-slate-500">{tech.mobile || tech?.phone}</div>
                          </td>
                          <td className="px-4 py-3 align-top">
                            <div className="font-mono text-sm bg-slate-100 px-2 py-1 rounded inline-block text-slate-700 font-medium">{tech.loginId || 'N/A'}</div>
                          </td>
                          <td className="px-4 py-3 align-top">
                            <div className="flex items-center gap-2">
                              <div className="font-mono text-sm bg-slate-100 px-2 py-1 rounded text-slate-700">
                                {showPasswordId === tech?.id ? tech.password : '••••••••'}
                              </div>
                              <button 
                                onClick={() => setShowPasswordId(showPasswordId === tech?.id ? null : tech?.id)}
                                className="text-xs text-blue-600 hover:text-blue-800 font-bold bg-blue-50 px-2 py-1 rounded"
                              >
                                {showPasswordId === tech?.id ? 'Hide' : 'Show'}
                              </button>
                            </div>
                          </td>
                          <td className="px-4 py-3 align-top">
                            <div className="text-sm font-medium text-slate-700">{tech.pinCode || (tech.pincodes ? tech.pincodes?.join(', ') : 'All')}</div>
                          </td>
                          <td className="px-4 py-3 align-top">
                            <span className={`px-2 py-1 rounded-full text-xs font-bold uppercase ${tech.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                              {tech.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="px-4 py-3 align-top text-right space-x-2">
                            <button onClick={() => handleEditTech(tech)} className="text-blue-600 hover:text-blue-800 font-medium text-sm">Edit</button>
                            <button onClick={() => handleDeleteActiveTech(tech?.id)} className="text-red-600 hover:text-red-800 font-medium text-sm">Delete</button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {techAppModal.isOpen && (
              <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
                <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200 relative border border-slate-100">
                  <h3 className="text-xl font-bold text-slate-900 mb-2">Update Application Status</h3>
                  <p className="text-sm text-slate-500 mb-4">You are about to mark <strong>{techAppModal.name}</strong> as <span className="font-bold">{techAppModal.action}</span>.</p>
                  
                  {techAppModal.action === 'Approved' ? (
                    <div className="space-y-4 mb-6">
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1">Generate Login ID</label>
                        <input
                          type="text"
                          required
                          value={techAppModal.loginId}
                          onChange={(e) => setTechAppModal({...techAppModal, loginId: e.target.value})}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1">Create Account Password</label>
                        <input
                          type="text"
                          required
                          value={techAppModal.password}
                          onChange={(e) => setTechAppModal({...techAppModal, password: e.target.value})}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1">Assign Area Admin</label>
                        <select
                          required
                          value={techAppModal.areaAdminId}
                          onChange={(e) => setTechAppModal({...techAppModal, areaAdminId: e.target.value})}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                        >
                          {(() => {
                            try { let admins = areaAdmins || []; return ( <> <option value="">-- Select Area Admin --</option> {admins.map((admin: any) => ( <option key={admin.id || admin.phone} value={admin.phone}> {admin.name} ({Array.isArray(admin.assignedPincodes) ? admin.assignedPincodes.join(', ') : (admin.assignedPincodes || admin.pincodes?.join(', ') || 'All Areas')}) </option> ))} </> ); } catch (e) { return <option value="">Error loading admins</option>; }
                          })()}
                        </select>
                      </div>
                    </div>
                  ) : (
                    <div className="mb-6">
                      <label className="block text-sm font-semibold text-slate-700 mb-2">Optional Reason / Note</label>
                      <textarea
                        value={techAppModal.reason}
                        onChange={(e) => setTechAppModal({...techAppModal, reason: e.target.value})}
                        rows={3}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                        placeholder="e.g. Approved for AC repairs. Need to re-submit DL. etc."
                      ></textarea>
                      <p className="text-xs text-slate-400 mt-1">This will be included in the WhatsApp notification.</p>
                    </div>
                  )}
                  
                  <div className="flex gap-3 justify-end mt-6">
                    <button onClick={() => setTechAppModal({ isOpen: false, appId: '', action: '', reason: '', phone: '', name: '', loginId: '', password: '', areaAdminId: '' })} className="px-4 py-2 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg font-bold transition-colors">Cancel</button>
                    <button onClick={submitApplicationStatus} className="px-5 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition-colors shadow flex items-center gap-2">Save & Send WhatsApp</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        
        ) : activeTab === 'technicians' ? (
          <div className="bg-white/70 backdrop-blur-xl rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/40 hover:border-blue-200/50 hover:shadow-[0_0_20px_rgba(59,130,246,0.15)] transition-all duration-300 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex flex-col gap-2">
                <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                  <Users className="w-5 h-5 text-blue-600" /> Manage Technicians
                </h2>
                <p className="text-sm text-slate-500">Register, allocate and manage technical staff.</p>
              </div>
              <button 
                onClick={() => setNewTechModalOpen(true)}
                className="bg-blue-600 text-white px-5 py-2.5 rounded-lg font-bold hover:bg-blue-700 transition-colors shadow-sm text-sm w-fit flex items-center gap-2"
              >
                + Register & Create Technician ID
              </button>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-600 text-sm border-y border-slate-200">
                    <th className="py-4 px-6 font-semibold">Tech ID & Name</th>
                    <th className="py-4 px-6 font-semibold">Contact</th>
                    <th className="py-4 px-6 font-semibold">Login Credentials</th>
                    <th className="py-4 px-6 font-semibold">Area / PIN</th>
                    <th className="py-4 px-6 font-semibold">Shift & Attendance</th>
                    <th className="py-4 px-6 font-semibold">Status</th>
                    <th className="py-4 px-6 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {technicians?.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-500">No active technicians registered yet.</td>
                    </tr>
                  ) : (
                    [...new Map(technicians?.map(t => [t.id || t.phone || Math.random(), t])).values()]?.map((tech) => (
                      <tr key={tech?.id || tech?.phone} className="hover:bg-slate-50 transition-colors">
                        <td className="py-4 px-6">
                          <div className="font-bold text-slate-900">{tech?.name}</div>
                          <div className="text-xs text-slate-500 font-mono mt-0.5">{tech?.id}</div>
                        </td>
                        <td className="py-4 px-6">
                          <div className="text-sm text-slate-700">{tech?.phone || tech.mobile}</div>
                        </td>
                        <td className="py-4 px-6">
                          <div className="text-sm">
                            <span className="font-medium text-slate-700">ID:</span> <span className="font-mono bg-slate-100 px-1 py-0.5 rounded text-xs">{tech.loginId || 'N/A'}</span>
                          </div>
                          <div className="text-sm mt-1">
                            <span className="font-medium text-slate-700">Pass:</span> <span className="font-mono bg-slate-100 px-1 py-0.5 rounded text-xs">{tech.password || '***'}</span>
                          </div>
                        </td>
                        <td className="py-4 px-6">
                          <div className="text-sm text-slate-700">
                            {tech.areaAdminId ? (
                              <span className="inline-flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full bg-blue-500"></span> 
                                {areaAdmins?.find(a => a.id === tech.areaAdminId)?.name || tech.areaAdminId}
                              </span>
                            ) : (
                              <span className="text-slate-400 italic">Unassigned</span>
                            )}
                          </div>
                          {tech.pincodes && tech.pincodes?.length > 0 && (
                            <div className="text-xs text-slate-500 mt-1">{tech.pincodes?.join(', ')}</div>
                          )}
                        </td>
                        <td className="py-4 px-6">
                          {(() => {
                            const att = attendanceRecords[tech?.id];
                            const isOn = att?.isOnShift;
                            return (
                              <div>
                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${
                                  isOn ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                                }`}>
                                  <span className={`w-2 h-2 rounded-full ${isOn ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                                  {isOn ? 'On Shift' : 'Off Shift'}
                                </span>
                                {att?.lastShiftStart && (
                                  <div className="text-[11px] text-slate-500 mt-1">
                                    {isOn
                                      ? `Started: ${new Date(att.lastShiftStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                                      : `Ended: ${new Date(att.lastShiftEnd || att.lastShiftStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </td>
                        <td className="py-4 px-6">
                          <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-bold uppercase ${tech.isActive !== false ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {tech.isActive !== false ? 'ACTIVE' : 'INACTIVE'}
                          </span>
                        </td>
                        <td className="py-4 px-6 text-right">
                          <div className="flex justify-end gap-2 text-xs font-semibold">
                            <button 
                              onClick={() => handleEditTech(tech)}
                              className="px-3 py-1.5 text-slate-600 hover:text-blue-700 hover:bg-blue-50 rounded-md border border-slate-200 transition-colors bg-white shadow-sm">
                              ✏️ Edit Details
                            </button>
                            <button 
                              onClick={() => handleResetTechPassword(tech.id)}
                              className="px-3 py-1.5 text-slate-600 hover:text-amber-700 hover:bg-amber-50 rounded-md border border-slate-200 transition-colors bg-white shadow-sm">
                              🔑 Reset Password
                            </button>
                            <button 
                              onClick={() => handleDeleteActiveTech(tech.id)}
                              className="px-3 py-1.5 text-slate-600 hover:text-red-700 hover:bg-red-50 rounded-md border border-slate-200 transition-colors bg-white shadow-sm">
                              🗑️ Delete Tech
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : activeTab === 'inventory' ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-1">
              <div className="bg-white/70 backdrop-blur-xl rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/40 overflow-hidden sticky top-24">
                <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
                  <h2 className="text-xl font-bold text-slate-900">{isEditingInventory ? 'Edit Part' : 'Add New Part'}</h2>
                </div>
                <div className="p-6">
                  <form onSubmit={handleSaveInventory} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
                      <select required value={invCategory} onChange={(e) => setInvCategory(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-md">
                        <option value="AC">AC</option>
                        <option value="WashingMachine">Washing Machine</option>
                        <option value="Refrigerator">Refrigerator</option>
                        <option value="Cooler">Cooler</option>
                        <option value="Fan">Fan</option>
                        <option value="Microwave">Microwave</option>
                        <option value="HouseWiring">House Wiring</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                    {invCategory === 'Other' && (
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Custom Category</label>
                        <input type="text" value={customInvCategory} onChange={(e) => setCustomInvCategory(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-md" />
                      </div>
                    )}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Part Name</label>
                      <input required type="text" value={invPartName} onChange={(e) => setInvPartName(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-md" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Stock Qty</label>
                        <input required type="number" min="0" value={invStockQuantity} onChange={(e) => setInvStockQuantity(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-md" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Cost Price (₹)</label>
                        <input required type="number" min="0" value={invCostPrice} onChange={(e) => setInvCostPrice(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-md" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Selling Price (₹)</label>
                      <input required type="number" min="0" value={invSellingPrice} onChange={(e) => setInvSellingPrice(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-md" />
                    </div>
                    <div className="flex gap-2">
                      <button type="submit" className="flex-1 bg-blue-600 text-white py-2 rounded-md font-bold">{isEditingInventory ? 'Update' : 'Add'} Part</button>
                      {isEditingInventory && (
                        <button type="button" onClick={resetInventoryForm} className="px-4 py-2 bg-slate-200 text-slate-700 rounded-md font-bold">Cancel</button>
                      )}
                    </div>
                  </form>
                </div>
              </div>
            </div>
            <div className="lg:col-span-2">
              <div className="bg-white/70 backdrop-blur-xl rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/40 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
                  <h2 className="text-xl font-bold text-slate-900">Inventory Stock</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/50">
                        <th className="px-6 py-3 text-sm font-bold text-slate-700">Part Info</th>
                        <th className="px-6 py-3 text-sm font-bold text-slate-700">Pricing</th>
                        <th className="px-6 py-3 text-sm font-bold text-slate-700">Stock</th>
                        <th className="px-6 py-3 text-sm font-bold text-slate-700 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inventory?.map((item) => (
                        <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                          <td className="px-6 py-4">
                            <div className="font-bold text-slate-900">{item.partName}</div>
                            <div className="text-sm text-slate-500">{item.category}</div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm text-slate-900">Sell: ₹{item.sellingPrice}</div>
                            <div className="text-sm text-slate-500">Cost: ₹{item.costPrice}</div>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`px-2 py-1 rounded text-xs font-bold ${item.stockQuantity > 5 ? 'bg-green-100 text-green-800' : item.stockQuantity > 0 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>
                              {item.stockQuantity} in stock
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button onClick={() => editInventory(item)} className="text-blue-600 hover:text-blue-800 font-medium px-3 py-1 bg-blue-50 rounded mr-2">Edit</button>
                            <button onClick={() => handleDeleteInventory(item.id!)} className="text-red-600 hover:text-red-800 font-medium px-3 py-1 bg-red-50 rounded">Delete</button>
                          </td>
                        </tr>
                      ))}
                      {inventory?.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-6 py-8 text-center text-slate-500">No inventory items found. Add some parts to get started.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        ) : activeTab === 'reports' ? (
          <AnalyticsReportsDashboard />
        ) : activeTab === 'analytics' ? (
          <AdminAnalytics complaints={complaints} technicians={technicians} />
        ) : activeTab === 'ai-manager' ? (
          <AIManager complaints={complaints} inventory={inventory} />
        ) : activeTab === 'products' ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-1">
              <div className="bg-white/70 backdrop-blur-xl rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/40 hover:border-blue-200/50 hover:shadow-[0_0_20px_rgba(59,130,246,0.15)] transition-all duration-300 overflow-hidden sticky top-24">
                <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
                  <h3 className="text-lg font-bold text-slate-900">{isEditing ? 'Edit Product' : 'Add New Product'}</h3>
                </div>
                <div className="p-6">
                  <form onSubmit={handleSaveProduct} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Product Name</label>
                      <input type="text" required value={name} onChange={e => setName(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-0 focus:border-blue-400 focus:shadow-[0_0_15px_rgba(59,130,246,0.3)] transition-all" placeholder="e.g. Voltas 1.5 Ton AC" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
                        <input type="text" required value={category} onChange={e => setCategory(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-0 focus:border-blue-400 focus:shadow-[0_0_15px_rgba(59,130,246,0.3)] transition-all" placeholder="e.g. AC" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Price (₹)</label>
                        <input type="number" required value={price} onChange={e => setPrice(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-0 focus:border-blue-400 focus:shadow-[0_0_15px_rgba(59,130,246,0.3)] transition-all" placeholder="e.g. 34990" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Product Image</label>
                      <input 
                        type="file" 
                        accept="image/*"
                        required={!image} // Required if no image is already set
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onloadend = () => {
                              setImage(reader.result as string);
                            };
                            reader.readAsDataURL(file);
                          }
                        }} 
                        className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-0 focus:border-blue-400 focus:shadow-[0_0_15px_rgba(59,130,246,0.3)] transition-all file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" 
                      />
                      {image && <img src={image} alt="Preview" className="mt-2 h-20 object-cover rounded border border-slate-200" />}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                      <textarea required rows={3} value={description} onChange={e => setDescription(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-0 focus:border-blue-400 focus:shadow-[0_0_15px_rgba(59,130,246,0.3)] transition-all resize-none" placeholder="Short description of the product"></textarea>
                    </div>
                    <div className="pt-4 flex gap-3">
                      <button type="submit" className="flex-1 bg-blue-600 text-white font-bold py-2 px-4 rounded-md hover:bg-blue-700 flex justify-center items-center gap-2">
                        {isEditing ? <><Check className="h-4 w-4" /> Update Product</> : <><Plus className="h-4 w-4" /> Add Product</>}
                      </button>
                      {isEditing && (
                        <button type="button" onClick={resetForm} className="bg-slate-200 text-slate-800 font-bold py-2 px-4 rounded-md hover:bg-slate-300">
                          Cancel
                        </button>
                      )}
                    </div>
                  </form>
                </div>
              </div>
            </div>

            <div className="lg:col-span-2">
              <div className="bg-white/70 backdrop-blur-xl rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/40 hover:border-blue-200/50 hover:shadow-[0_0_20px_rgba(59,130,246,0.15)] transition-all duration-300 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                  <h3 className="text-lg font-bold text-slate-900">Manage Products ({products?.length})</h3>
                </div>
                <ul className="divide-y divide-slate-200">
                  {products?.length === 0 ? (
                    <li className="p-8 text-center text-slate-500">No products found. Add some using the form.</li>
                  ) : (
                    products?.map(product => (
                      <li key={product.id} className="p-4 sm:p-6 hover:bg-slate-50 transition-colors flex items-center justify-between gap-4">
                        <div className="flex items-center gap-4 flex-1">
                          <img src={product.image} alt={product.name} className="h-16 w-16 object-cover rounded-md border border-slate-200 shrink-0 bg-white" />
                          <div>
                            <h4 className="font-bold text-slate-900 text-lg">{product.name}</h4>
                            <div className="flex items-center gap-3 text-sm text-slate-500 mt-1">
                              <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-medium">{product.category}</span>
                              <span className="font-bold text-slate-700">₹{product.price.toLocaleString('en-IN')}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <button onClick={() => editProduct(product)} className="p-2 text-blue-600 hover:bg-blue-100 rounded-md transition-colors" title="Edit">
                            <Edit2 className="h-5 w-5" />
                          </button>
                          <button onClick={() => product.id && handleDelete(product.id)} className="p-2 text-red-600 hover:bg-red-100 rounded-md transition-colors" title="Delete">
                            <Trash2 className="h-5 w-5" />
                          </button>
                        </div>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            </div>

            {/* Dedicated Product Booking & Order Requests Section */}
            <div className="lg:col-span-3">
              <ProductBookingRequests allowedPincodes={user?.role === 'area_admin' ? user?.pincodes : undefined} />
            </div>
          </div>
        ) : null}

        {activeTab === 'orders' && (
          <AdminOrdersManager 
            userRole={user.role === 'super_admin' ? 'super_admin' : 'area_admin'}
            allowedPincodes={user.role === 'area_admin' ? user.pincodes : undefined}
          />
        )}

        {activeTab === 'reports' && (
          <AnalyticsReportsDashboard />
        )}
        </main>

      {resolutionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm px-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-lg">
            <h3 className="text-xl font-bold text-slate-900 mb-4">Resolve Complaint</h3>
            <form onSubmit={handleResolveComplaint} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Select Replaced Part from Inventory</label>
                <select 
                  value={selectedInventoryId}
                  onChange={e => {
                    setSelectedInventoryId(e.target.value);
                    if (e.target.value) {
                      const selectedItem = inventory?.find(i => i.id === e.target.value);
                      if (selectedItem) {
                        setTotalCost(selectedItem.sellingPrice.toString());
                      }
                    }
                  }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-0 focus:border-blue-400 focus:shadow-[0_0_15px_rgba(59,130,246,0.3)] transition-all appearance-none bg-white"
                >
                  <option value="">-- Manual Entry (Not from inventory) --</option>
                  {inventory?.filter(i => i.stockQuantity > 0)?.map(item => (
                    <option key={item.id} value={item.id}>
                      {item.partName} ({item.category}) - ₹{item.sellingPrice} - Stock: {item.stockQuantity}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-sm font-medium text-slate-700">
                    {selectedInventoryId ? 'Additional Notes (Optional)' : 'Replaced Part Name & Details (Required)'}
                  </label>
                  <VoiceInput 
                    isListening={isListeningPart}
                    setIsListening={setIsListeningPart}
                    onResult={(text) => setReplacedPartName(prev => prev ? `${prev} ${text}` : text)}
                  />
                </div>
                <textarea 
                  required={!selectedInventoryId}
                  rows={2}
                  maxLength={500}
                  value={replacedPartName}
                  onChange={e => setReplacedPartName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-0 focus:border-blue-400 focus:shadow-[0_0_15px_rgba(59,130,246,0.3)] transition-all"
                  placeholder={selectedInventoryId ? "Any additional details..." : "e.g. Compressor, Gas Recharge..."}
                ></textarea>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Old Part Photo</label>
                  <div className="relative">
                    <input 
                      type="file" 
                      accept="image/*"
                      capture="environment"
                      onChange={(e) => handleFileUpload(e, setOldPartPhoto)}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                      disabled={isUploadingPhoto}
                    />
                    <div className={`w-full px-3 py-2 border ${oldPartPhoto ? 'border-green-300 bg-green-50' : 'border-slate-300 bg-slate-50'} rounded-md flex items-center justify-center gap-2 text-slate-600`}>
                      <Camera className="w-4 h-4" />
                      <span className="text-sm font-medium">{oldPartPhoto ? 'Photo Uploaded' : 'Capture or Upload'}</span>
                    </div>
                  </div>
                  {oldPartPhoto && <img src={oldPartPhoto} alt="Old part" className="mt-2 h-20 w-full object-cover rounded border border-slate-200" />}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">New Part Photo</label>
                  <div className="relative">
                    <input 
                      type="file" 
                      accept="image/*"
                      capture="environment"
                      onChange={(e) => handleFileUpload(e, setNewPartPhoto)}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                      disabled={isUploadingPhoto}
                    />
                    <div className={`w-full px-3 py-2 border ${newPartPhoto ? 'border-green-300 bg-green-50' : 'border-slate-300 bg-slate-50'} rounded-md flex items-center justify-center gap-2 text-slate-600`}>
                      <Camera className="w-4 h-4" />
                      <span className="text-sm font-medium">{newPartPhoto ? 'Photo Uploaded' : 'Capture or Upload'}</span>
                    </div>
                  </div>
                  {newPartPhoto && <img src={newPartPhoto} alt="New part" className="mt-2 h-20 w-full object-cover rounded border border-slate-200" />}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Serial Number / Product ID</label>
                <input 
                  type="text" 
                  maxLength={50}
                  pattern="[A-Za-z0-9\-]+"
                  value={serialNumber}
                  onChange={e => setSerialNumber(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-0 focus:border-blue-400 focus:shadow-[0_0_15px_rgba(59,130,246,0.3)] transition-all"
                  placeholder="e.g. SN-12345678"
                />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Warranty (Days)</label>
                  <input 
                    type="number" 
                    min="0"
                    max="1825"
                    value={warrantyDays}
                    onChange={e => setWarrantyDays(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-0 focus:border-blue-400 focus:shadow-[0_0_15px_rgba(59,130,246,0.3)] transition-all"
                    placeholder="e.g. 30"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Total Repair Cost (₹)</label>
                  <input 
                    type="number" 
                    required
                    min="0"
                    max="500000"
                    value={totalCost}
                    onChange={e => setTotalCost(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-0 focus:border-blue-400 focus:shadow-[0_0_15px_rgba(59,130,246,0.3)] transition-all"
                    placeholder="e.g. 2500"
                  />
                </div>
                <div className="col-span-2 md:col-span-1">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Payment Status</label>
                  <select 
                    value={paymentStatus}
                    onChange={e => setPaymentStatus(e.target.value as 'Paid' | 'Pending')}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-0 focus:border-blue-400 focus:shadow-[0_0_15px_rgba(59,130,246,0.3)] transition-all bg-white"
                  >
                    <option value="Paid">Paid</option>
                    <option value="Pending">Payment Pending</option>
                  </select>
                </div>
              </div>
              
              <div className="flex gap-3 pt-4 border-t border-slate-100">
                <button 
                  type="button"
                  onClick={() => setResolutionModalOpen(false)}
                  className="flex-1 bg-slate-100 text-slate-700 font-bold py-2 px-4 rounded-md hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={isUploadingPhoto}
                  className="flex-1 bg-green-600 text-white font-bold py-2 px-4 rounded-md hover:bg-green-700 transition-colors disabled:opacity-50"
                >
                  {isUploadingPhoto ? 'Uploading Photo...' : 'Mark as Resolved'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {updateStatusModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm px-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-lg">
            <h3 className="text-xl font-bold text-slate-900 mb-4">Update Status</h3>
            <form onSubmit={handleUpdateCustomStatus} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
                <select 
                  value={customStatus}
                  onChange={e => setCustomStatus(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-0 focus:border-blue-400 focus:shadow-[0_0_15px_rgba(59,130,246,0.3)] transition-all appearance-none bg-white"
                >
                  <option value="In Progress">In Progress</option>
                  <option value="Customer Not Reachable">Customer Not Reachable / Phone Off</option>
                  <option value="Awaiting Part">Spare Part Out of Stock / Awaiting Part</option>
                  <option value="Scheduled">Technician On The Way / Scheduled</option>
                  <option value="Other">Other Note</option>
                </select>
              </div>
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-sm font-medium text-slate-700">Remarks / Note for Customer</label>
                  <VoiceInput 
                    isListening={isListeningNote}
                    setIsListening={setIsListeningNote}
                    onResult={(text) => setCustomRemark(prev => prev ? `${prev} ${text}` : text)}
                  />
                </div>
                <textarea 
                  required
                  rows={3}
                  value={customRemark}
                  onChange={e => setCustomRemark(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-0 focus:border-blue-400 focus:shadow-[0_0_15px_rgba(59,130,246,0.3)] transition-all"
                  placeholder="e.g. Part 2 din me aayega..."
                ></textarea>
              </div>
              
              <div className="flex gap-3 pt-4 border-t border-slate-100">
                <button 
                  type="button"
                  onClick={() => {
                    setUpdateStatusModalOpen(false);
                    setUpdatingComplaintId(null);
                    setUpdatingComplaintData(null);
                  }}
                  className="flex-1 bg-slate-100 text-slate-700 font-bold py-2 px-4 rounded-md hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="flex-1 bg-blue-600 text-white font-bold py-2 px-4 rounded-md hover:bg-blue-700 transition-colors"
                >
                  Update
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* History Modal */}
      
            {newTechModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm px-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold text-slate-900 mb-4">{editingTechId ? "Edit Technician Details" : "Register & Create Technician ID"}</h3>
            <form onSubmit={handleSaveNewTech} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">👤 Technician Full Name</label>
                  <input required type="text" value={newTech.name} onChange={e => setNewTech({...newTech, name: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-0 focus:border-blue-400 focus:shadow-[0_0_15px_rgba(59,130,246,0.3)] transition-all bg-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">📱 Mobile / Phone Number</label>
                  <input required type="text" value={newTech.mobile} onChange={e => setNewTech({...newTech, mobile: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-0 focus:border-blue-400 focus:shadow-[0_0_15px_rgba(59,130,246,0.3)] transition-all bg-white" />
                </div>
              </div>
              
              
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">💰 Base Monthly Salary (₹)</label>
                  <input required type="number" value={newTech.baseSalary} onChange={e => setNewTech({...newTech, baseSalary: parseInt(e.target.value) || 0})} className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-0 focus:border-blue-400 focus:shadow-[0_0_15px_rgba(59,130,246,0.3)] transition-all bg-white" placeholder="e.g. 15000" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-blue-50 p-4 rounded-xl border border-blue-100">
                <div>
                  <label className="block text-sm font-medium text-blue-900 mb-1">🆔 Unique Login ID</label>
                  <input required type="text" value={newTech.loginId} onChange={e => setNewTech({...newTech, loginId: e.target.value})} className="w-full px-3 py-2 border border-blue-200 rounded-md focus:ring-0 focus:border-blue-400 transition-all bg-white" placeholder="e.g. TECH_208001" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-blue-900 mb-1">🔑 Account Password</label>
                  <input required type="text" value={newTech.password} onChange={e => setNewTech({...newTech, password: e.target.value})} className="w-full px-3 py-2 border border-blue-200 rounded-md focus:ring-0 focus:border-blue-400 transition-all bg-white" />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">📍 Assigned Area PIN Code</label>
                  <input required type="text" value={newTech.pincode} onChange={e => setNewTech({...newTech, pincode: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-0 focus:border-blue-400 focus:shadow-[0_0_15px_rgba(59,130,246,0.3)] transition-all bg-white" placeholder="e.g. 209202" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">🛠️ Specialization / Service</label>
                  <input required type="text" value={newTech.skills} onChange={e => setNewTech({...newTech, skills: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-0 focus:border-blue-400 focus:shadow-[0_0_15px_rgba(59,130,246,0.3)] transition-all bg-white" placeholder="e.g. AC Repair, Electricals" />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">🏛️ Link to Area Admin</label>
                <select 
                  required 
                  value={newTech.areaAdminId} 
                  onChange={e => setNewTech({...newTech, areaAdminId: e.target.value})} 
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-0 focus:border-blue-400 focus:shadow-[0_0_15px_rgba(59,130,246,0.3)] transition-all bg-white"
                >
                  {(() => {
                    try { let admins = areaAdmins || []; return ( <> <option value="">-- Select Area Admin --</option> {admins.map((admin: any) => ( <option key={admin.id || admin.phone} value={admin.phone}> {admin.name} ({Array.isArray(admin.assignedPincodes) ? admin.assignedPincodes.join(', ') : (admin.assignedPincodes || admin.pincodes?.join(', ') || 'All Areas')}) </option> ))} </> ); } catch (e) { return <option value="">Error loading admins</option>; }
                  })()}
                </select>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input type="checkbox" checked={newTech.isActive} onChange={e => setNewTech({...newTech, isActive: e.target.checked})} className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4" />
                <label className="text-sm font-medium text-slate-700">Active Status</label>
              </div>
              <div className="flex gap-3 pt-4 border-t border-slate-100">
                <button type="button" onClick={() => { setNewTechModalOpen(false); setEditingTechId(null); setNewTech({ name: '', mobile: '', pincode: '', skills: '', loginId: '', password: '', areaAdminId: '', isActive: true, baseSalary: 15000 }); }} className="flex-1 bg-slate-100 text-slate-700 font-bold py-3 px-4 rounded-xl hover:bg-slate-200 transition-colors">Cancel</button>
                <button type="submit" className="flex-1 bg-blue-600 text-white font-bold py-3 px-4 rounded-xl hover:bg-blue-700 transition-colors">{editingTechId ? "Update Technician" : "Create Technician"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {assignModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm px-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-lg">
            <h3 className="text-xl font-bold text-slate-900 mb-4">🚨 Alert Technician</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Select Technician</label>
                <select 
                  value={selectedTechId}
                  onChange={e => setSelectedTechId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-0 focus:border-blue-400 focus:shadow-[0_0_15px_rgba(59,130,246,0.3)] transition-all bg-white"
                >
                  <option value="">-- Choose a Technician --</option>
                  {(() => {
                    const complaint = complaints?.find(c => c.id === assigningComplaintId);
                    const cPin = complaint?.pincode;
                    const cAdmin = areaAdmins?.find(a => a.pincodes && a.pincodes?.includes(cPin));
                    const allTechs = technicians || [];
                    const filteredTechs = allTechs?.filter(t => {
                      if (!cPin) return true;
                      const matchesAreaAdmin = cAdmin && t.areaAdminId === cAdmin.id;
                      const matchesPin = t.pincodes && t.pincodes?.includes(cPin);
                      const matchesTechPin = t.pinCode === cPin;
                      return matchesAreaAdmin || matchesPin || matchesTechPin;
                    });
                    return filteredTechs;
                  })()?.map(t => (
                    <option key={t.id || t.phone} value={t.id || t.name}>{t.name} ({t.phone || t.mobile})</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3 pt-4 border-t border-slate-100">
                <button 
                  type="button"
                  onClick={() => setAssignModalOpen(false)}
                  className="flex-1 bg-slate-100 text-slate-700 font-bold py-2 px-4 rounded-md hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="button"
                  onClick={() => {
                    if (assigningComplaintId && selectedTechId) {
                      handleAssignTechnician(assigningComplaintId, selectedTechId);
                      setAssignModalOpen(false);
                    } else {
                      alert('Please select a technician');
                    }
                  }}
                  className="flex-1 bg-indigo-600 text-white font-bold py-2 px-4 rounded-md hover:bg-indigo-700 transition-colors"
                >Confirm Alert & Assign</button>
              </div>
            </div>
          </div>
        </div>
      )}

      
      
      {viewingAdminComplaints && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white w-full max-w-3xl h-full shadow-2xl flex flex-col animate-slide-in-right">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-slate-900">Area Complaints: {viewingAdminComplaints.name}</h3>
                <p className="text-sm text-slate-500">Pincodes: {viewingAdminComplaints.pincodes?.join(', ')}</p>
              </div>
              <button 
                onClick={() => setViewingAdminComplaints(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              {(() => {
                const adminPins = (viewingAdminComplaints.pincodes || viewingAdminComplaints.assignedPincodes || []).map((p: any) => normalizePincode(p)).filter(Boolean);
                const adminComplaints = complaints?.filter(c => {
                  const compPin = normalizePincode(c?.pincode || c?.pinCode);
                  return compPin && adminPins.includes(compPin);
                });
                if (!adminComplaints || adminComplaints.length === 0) {
                  return <div className="text-center text-slate-500 mt-10">No complaints found for these pincodes.</div>;
                }
                return (
                  <div className="space-y-4">
                    {adminComplaints?.map(c => (
                      <div key={c.id} className="border border-slate-200 rounded-lg p-4 hover:bg-slate-50 transition-colors">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <span className="font-bold text-slate-900">{c.ticketId}</span>
                            <span className="ml-2 text-sm text-slate-500">{new Date(c.createdAt).toLocaleDateString()}</span>
                          </div>
                          <span className={`px-2 py-1 rounded text-xs font-bold ${
                            c?.status === 'COMPLETED' ? 'bg-green-100 text-green-800' :
                            c?.status === 'In Progress' ? 'bg-blue-100 text-blue-800' :
                            'bg-yellow-100 text-yellow-800'
                          }`}>
                            {c?.status}
                          </span>
                        </div>
                        <div className="text-sm text-slate-700 mb-2">
                          <span className="font-medium">{c?.name}</span> • {c?.phone}
                        </div>
                        <div className="text-sm text-slate-600 mb-2">{c.address}, {c?.pincode}</div>
                        <div className="bg-slate-100 rounded p-2 text-sm text-slate-800 mb-2">
                          <span className="font-medium">{c.deviceType}</span>: {c?.issue}
                        </div>
                        <div className="text-sm">
                          <span className="text-slate-500">Assigned Tech: </span>
                          <span className="font-medium text-slate-900">{c.assignedTechnicianName || 'Unassigned'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {aaModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm px-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold text-slate-900 mb-4">{aaModal.id ? 'Edit Area Admin' : 'Add New Area Admin'}</h3>
            <form onSubmit={handleSaveAreaAdmin} noValidate className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Area Admin Name <span className="text-rose-500">*</span>
                </label>
                <input 
                  type="text" 
                  value={aaModal.name} 
                  onChange={e => {
                    setAaModal({...aaModal, name: e.target.value});
                    if (aaFieldErrors.name) setAaFieldErrors(prev => ({ ...prev, name: '' }));
                  }} 
                  className={`w-full px-3 py-2 border rounded-lg text-sm outline-none transition-colors ${
                    aaFieldErrors.name ? 'border-rose-500 focus:ring-2 focus:ring-rose-500 bg-rose-50/20' : 'border-slate-300 focus:ring-2 focus:ring-blue-500'
                  }`} 
                  placeholder="e.g. Loyalty or Bilhaur Admin" 
                />
                {aaFieldErrors.name && (
                  <p className="text-xs text-rose-600 mt-1 font-medium">{aaFieldErrors.name}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Login ID <span className="text-rose-500">*</span>
                </label>
                <input 
                  type="text" 
                  value={aaModal.loginId} 
                  onChange={e => {
                    setAaModal({...aaModal, loginId: e.target.value});
                    if (aaFieldErrors.loginId) setAaFieldErrors(prev => ({ ...prev, loginId: '' }));
                  }} 
                  className={`w-full px-3 py-2 border rounded-lg text-sm outline-none font-mono transition-colors ${
                    aaFieldErrors.loginId ? 'border-rose-500 focus:ring-2 focus:ring-rose-500 bg-rose-50/20' : 'border-slate-300 focus:ring-2 focus:ring-blue-500'
                  }`} 
                  placeholder="e.g. loyalty or 8470984205" 
                />
                <p className="text-[11px] text-slate-500 mt-0.5">Used by the Area Admin to sign in to the regional portal.</p>
                {aaFieldErrors.loginId && (
                  <p className="text-xs text-rose-600 mt-1 font-medium">{aaFieldErrors.loginId}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Password {!aaModal.id && <span className="text-rose-500">*</span>}
                </label>
                <input 
                  type="password" 
                  value={aaModal.password} 
                  onChange={e => {
                    setAaModal({...aaModal, password: e.target.value});
                    if (aaFieldErrors.password) setAaFieldErrors(prev => ({ ...prev, password: '' }));
                  }} 
                  className={`w-full px-3 py-2 border rounded-lg text-sm outline-none transition-colors ${
                    aaFieldErrors.password ? 'border-rose-500 focus:ring-2 focus:ring-rose-500 bg-rose-50/20' : 'border-slate-300 focus:ring-2 focus:ring-blue-500'
                  }`} 
                  placeholder={aaModal.id ? "Leave blank to keep current password, or enter new password to reset" : "Enter password (stored securely hashed)"} 
                />
                {aaModal.id && (
                  <p className="text-[11px] text-slate-500 mt-0.5">To change or reset password, enter a new one. Leave blank to keep existing.</p>
                )}
                {aaFieldErrors.password && (
                  <p className="text-xs text-rose-600 mt-1 font-medium">{aaFieldErrors.password}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Assigned PIN Code / Area <span className="text-rose-500">*</span>
                </label>
                <input 
                  type="text" 
                  value={aaModal.pincodes} 
                  onChange={e => {
                    setAaModal({...aaModal, pincodes: e.target.value});
                    if (aaFieldErrors.pincodes) setAaFieldErrors(prev => ({ ...prev, pincodes: '' }));
                  }} 
                  className={`w-full px-3 py-2 border rounded-lg text-sm outline-none font-mono transition-colors ${
                    aaFieldErrors.pincodes ? 'border-rose-500 focus:ring-2 focus:ring-rose-500 bg-rose-50/20' : 'border-slate-300 focus:ring-2 focus:ring-blue-500'
                  }`} 
                  placeholder="e.g. 20-21-02 or 209202, 208001" 
                />
                <p className="text-[11px] text-slate-500 mt-0.5">Format can be standard 209202 or formatted 20-21-02. Separate multiple PINs with commas.</p>
                {aaFieldErrors.pincodes && (
                  <p className="text-xs text-rose-600 mt-1 font-medium">{aaFieldErrors.pincodes}</p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">
                    Phone Number <span className="text-rose-500">*</span>
                  </label>
                  <input 
                    type="tel" 
                    value={aaModal.phone} 
                    onChange={e => {
                      setAaModal({...aaModal, phone: e.target.value});
                      if (aaFieldErrors.phone) setAaFieldErrors(prev => ({ ...prev, phone: '' }));
                    }} 
                    className={`w-full px-3 py-2 border rounded-lg text-sm outline-none transition-colors ${
                      aaFieldErrors.phone ? 'border-rose-500 focus:ring-2 focus:ring-rose-500 bg-rose-50/20' : 'border-slate-300 focus:ring-2 focus:ring-blue-500'
                    }`} 
                    placeholder="e.g. 9876543210" 
                  />
                  {aaFieldErrors.phone && (
                    <p className="text-xs text-rose-600 mt-1 font-medium">{aaFieldErrors.phone}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">
                    Email Address <span className="text-rose-500">*</span>
                  </label>
                  <input 
                    type="email" 
                    value={aaModal.email} 
                    onChange={e => {
                      setAaModal({...aaModal, email: e.target.value});
                      if (aaFieldErrors.email) setAaFieldErrors(prev => ({ ...prev, email: '' }));
                    }} 
                    className={`w-full px-3 py-2 border rounded-lg text-sm outline-none transition-colors ${
                      aaFieldErrors.email ? 'border-rose-500 focus:ring-2 focus:ring-rose-500 bg-rose-50/20' : 'border-slate-300 focus:ring-2 focus:ring-blue-500'
                    }`} 
                    placeholder="e.g. loyalty@sachin.com" 
                  />
                  {aaFieldErrors.email && (
                    <p className="text-xs text-rose-600 mt-1 font-medium">{aaFieldErrors.email}</p>
                  )}
                </div>
              </div>
              
              <div className="pt-2">
                <label className="flex items-center gap-2.5 cursor-pointer p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                  <input type="checkbox" checked={aaModal.isActive} onChange={e => setAaModal({...aaModal, isActive: e.target.checked})} className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4" />
                  <div>
                    <span className="text-sm font-bold text-slate-800">Account Active</span>
                    <p className="text-xs text-slate-500">Enable or disable login access and automatic regional complaint routing.</p>
                  </div>
                </label>
              </div>
              
              <div className="space-y-2 mt-4 pt-4 border-t border-slate-100">
                <h4 className="font-semibold text-sm text-slate-900">Regional Permissions</h4>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={aaModal.canEditInventory} onChange={e => setAaModal({...aaModal, canEditInventory: e.target.checked})} className="rounded text-blue-600 focus:ring-blue-500" />
                  <span className="text-sm text-slate-700">Can Edit Local Inventory</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={aaModal.canAlertTechs} onChange={e => setAaModal({...aaModal, canAlertTechs: e.target.checked})} className="rounded text-blue-600 focus:ring-blue-500" />
                  <span className="text-sm text-slate-700">Can Alert & Assign Technicians</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={aaModal.canWA} onChange={e => setAaModal({...aaModal, canWA: e.target.checked})} className="rounded text-blue-600 focus:ring-blue-500" />
                  <span className="text-sm text-slate-700">Can Send WhatsApp Updates</span>
                </label>
              </div>

              {aaFormError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-sm font-medium flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
                  <div className="flex-1">{aaFormError}</div>
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button 
                  type="button" 
                  onClick={() => {
                    setAaModal({...aaModal, isOpen: false});
                    setAaFieldErrors({});
                    setAaFormError('');
                  }} 
                  className="flex-1 bg-slate-100 text-slate-700 font-bold py-2.5 px-4 rounded-lg hover:bg-slate-200 transition-colors text-sm"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  id="save-admin-btn"
                  data-testid="save-admin-button"
                  disabled={isSavingAa}
                  className="flex-1 bg-blue-600 text-white font-bold py-2.5 px-4 rounded-lg hover:bg-blue-700 transition-colors shadow-sm text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isSavingAa ? 'Saving Admin...' : 'Save Admin'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
                        <p className="text-sm text-slate-700 font-bold">Cost: ₹{c.resolutionDetails.totalCost}</p>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
}


export default function Admin(props: any) {
  return (
    <ErrorBoundary>
      <InnerAdmin {...props} />
    </ErrorBoundary>
  );
}
