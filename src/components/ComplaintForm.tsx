// force refresh
import { ref, push, set, get, onValue } from 'firebase/database';
import React, { useState, useEffect } from 'react';
import { CheckCircle2, AlertCircle, Search, Clock, Wrench, Download, ImagePlus, X, Camera, MapPin, Navigation } from 'lucide-react';
import { motion } from 'motion/react';
import { rtdb, complaintsCollection, settingsCollection, db, areaAdminsCollection, loyaltyCollection } from '../lib/firebase';
import { collection, addDoc, doc, getDoc, getDocs, query, where, onSnapshot } from 'firebase/firestore';

import { Complaint, ServiceRate } from '../types';
import { generateInvoice } from '../utils/generateInvoice';
import DOMPurify from 'dompurify';
import VoiceInput from './VoiceInput';
import { isValidFile } from '../lib/security';
import complaintBgImg from '../assets/images/complaint_background_1785441977801.jpg';

function safeJSONParse(val: string | null, fallback: any) {
  if (!val) return fallback;
  try { return JSON.parse(val); } catch (e) { return fallback; }
}

export default function ComplaintForm() {
  const [activeTab, setActiveTab] = useState<'book' | 'track'>('book');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successJobId, setSuccessJobId] = useState<string>('');
  const [issueText, setIssueText] = useState('');
  const [customProduct, setCustomProduct] = useState('');
  const [selectedProduct, setSelectedProduct] = useState('');
  const [selectedServiceRateId, setSelectedServiceRateId] = useState('');
  const [phone, setPhone] = useState('');
  const [applyCoins, setApplyCoins] = useState(false);
  const [loyaltyCoins, setLoyaltyCoins] = useState(0);
  const [pricing, setPricing] = useState({ homeVisitCharge: 250, serviceFees: { 'AC': 200, 'WashingMachine': 150, 'Refrigerator': 150, 'Cooler': 100, 'Fan': 50, 'Microwave': 150, 'HouseWiring': 150, 'Other': 100 } });
  const [serviceRates, setServiceRates] = useState<ServiceRate[]>([]);
  const [issueImage, setIssueImage] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [address, setAddress] = useState('');
  
  const [nameText, setNameText] = useState('');
  const [pincodeText, setPincodeText] = useState('');
  const [phoneText, setPhoneText] = useState('');
  const [addressText, setAddressText] = useState('');
  const [trackPhone, setTrackPhone] = useState('');
  
  const [isListeningName, setIsListeningName] = useState(false);
  const [isListeningAddress, setIsListeningAddress] = useState(false);
  const [isListeningIssue, setIsListeningIssue] = useState(false);
  const [isTracking, setIsTracking] = useState(false);
  const [trackedComplaints, setTrackedComplaints] = useState<Complaint[] | null>(null);

  
  useEffect(() => {
    // 1. Listen to pricing from Cloud Firestore (primary)
    const unsubFirestorePricing = onSnapshot(doc(db, 'settings', 'pricing'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setPricing(prev => ({
          ...prev,
          ...data,
          serviceFees: { ...prev.serviceFees, ...(data.serviceFees || {}) }
        }));
      }
    }, (err) => {
      console.warn("Firestore pricing sync note:", err?.message || err);
    });

    // 2. Also listen to RTDB pricing as secondary
    let unsubPricing = () => {};
    try {
      unsubPricing = onValue(ref(rtdb, 'settings/pricing'), (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.val();
          setPricing(prev => ({ ...prev, ...data, serviceFees: { ...prev.serviceFees, ...(data.serviceFees || {}) } }));
        }
      }, () => {});
    } catch (e) {}

    // 3. Service rates from RTDB or fallback
    let unsubServiceRates = () => {};
    try {
      unsubServiceRates = onValue(ref(rtdb, 'serviceRates'), (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.val();
          setServiceRates(Object.keys(data).map(key => ({ id: key, ...data[key] })));
        } else {
          setServiceRates([]);
        }
      }, () => {});
    } catch (e) {}

    return () => {
      unsubFirestorePricing();
      unsubPricing();
      unsubServiceRates();
    };
  }, []);

  const handleGetLocation = () => {
    if (!navigator.geolocation) { alert("Geolocation is not supported by your browser"); return; }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(async (position) => {
      try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${position.coords.latitude}&lon=${position.coords.longitude}&format=json`);
        const data = await response.json();
        setAddressText(data.display_name);
      } catch (error) {}
      setIsLocating(false);
    }, () => {
      setIsLocating(false);
    });
  };

  const checkLoyalty = async (phoneNumber: string) => {
    try {
      const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
      // 1. Try Cloud Firestore loyalty collection
      try {
        const q = query(collection(db, 'loyalty'), where('phone', '==', cleanPhone));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const docData = snap.docs[0].data() as any;
          setLoyaltyCoins(docData.coins || 0);
          return;
        }
      } catch (fsErr) {
        console.warn("Firestore loyalty lookup note:", fsErr);
      }

      // 2. Fallback to RTDB
      try {
        const snap = await get(ref(rtdb, 'loyalty'));
        if (snap.exists()) {
          const allLoyalty = snap.val();
          const matchKey = Object.keys(allLoyalty).find(k => allLoyalty[k].phone === cleanPhone || allLoyalty[k].phone === phoneNumber);
          if (matchKey) {
            setLoyaltyCoins(allLoyalty[matchKey].coins || 0);
            return;
          }
        }
      } catch (e) {}

      setLoyaltyCoins(0);
    } catch (e) {
      console.warn("Failed to check loyalty", e);
      setLoyaltyCoins(0);
    }
  };

  const currentHour = new Date().getHours();
  const isClosed = currentHour < 9 || currentHour >= 21;

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!isValidFile(file)) {
        alert('Invalid file type or size. Please upload a valid image under 5MB.');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setIssueImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    const formElement = e.currentTarget;
    const formData = new FormData(formElement);
    const name = (formData.get('name') as string || '').trim();
    const phoneInput = (formData.get('phone') as string || '').trim();
    const pincode = (formData.get('pincode') as string || '').trim();
    const addressInput = (formData.get('address') as string || '').trim();

    // Frontend validation check
    if (!name || !phoneInput || !addressInput) {
      setErrorMessage('Please fill in all required fields (Name, Phone number, and Address).');
      setIsSubmitting(false);
      return;
    }

    let finalPincode = pincode || '000000';
    const pinMatch = addressInput.match(/\b\d{6}\b/) || pincode.match(/\b\d{6}\b/);
    if (pinMatch) finalPincode = pinMatch[0];

    const baseProduct = formData.get('product') as string;
    const product = baseProduct === 'Other' ? ((formData.get('customProduct') as string) || 'Other') : baseProduct;
    const issue = (formData.get('issue') as string || '').trim();
    const priority = (formData.get('priority') as 'Normal' | 'Urgent') || 'Normal';
    const timeslot = (formData.get('timeslot') as string) || 'Morning 10-12 AM';

    try {
      let assignedAreaAdminId: string | null = null;
      let adminPhone = "918381892161";

      // 1. Fetch Area Admins from Cloud Firestore with 3s timeout
      try {
        const areaAdminsPromise = getDocs(collection(db, 'areaAdmins'));
        const timeoutAdmins = new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 3000));
        const snapshot = await Promise.race([areaAdminsPromise, timeoutAdmins]) as any;
        if (snapshot && !snapshot.empty) {
          const admins = snapshot.docs.map((d: any) => ({ id: d.id, ...d.data() }));
          const localMatch = admins.find((a: any) => a.pincodes && a.pincodes.includes(finalPincode) && a.isActive);
          if (localMatch) {
            assignedAreaAdminId = localMatch.id;
            if (localMatch.phone) {
              let clean = String(localMatch.phone).replace(/[^0-9]/g, '');
              if (clean.length === 10) clean = "91" + clean;
              if (clean) adminPhone = clean;
            }
          }
        }
      } catch (err) {
        // Non-blocking fallback
      }
      
      const serviceFee = pricing.serviceFees[baseProduct] !== undefined ? pricing.serviceFees[baseProduct] : (pricing.serviceFees['Other'] || 100);
      const discount = applyCoins ? Math.floor(loyaltyCoins / 10) : 0;
      const estTotal = Math.max(0, pricing.homeVisitCharge + serviceFee - discount);

      const newComplaintData: Record<string, any> = {
        assignedAreaAdminId: assignedAreaAdminId || null,
        autoRouted: !!assignedAreaAdminId,
        name,
        phone: phoneInput,
        pincode: finalPincode,
        address: addressInput,
        product,
        issue,
        priority,
        timeslot,
        status: 'Pending',
        createdAt: new Date().toISOString(),
        serviceFee,
        discount,
        estTotal,
        ...(issueImage && { issueImageUrl: issueImage })
      };

      // 2. Primary Save: Cloud Firestore with a 15-second safety timeout
      const firestoreWritePromise = addDoc(collection(db, 'complaints'), newComplaintData);
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error('Database write timed out. Please check your internet connection and try again.'));
        }, 15000);
      });

      const docRef = await Promise.race([firestoreWritePromise, timeoutPromise]);
      const newComplaintId = docRef.id;

      // 3. Fire-and-forget background sync to RTDB if active (non-blocking)
      try {
        const complaintsListRef = ref(rtdb, 'complaints/' + newComplaintId);
        set(complaintsListRef, newComplaintData).catch(() => {});
      } catch (e) {}

      // 4. Update local storage for optimistic immediate display in tracking/admin
      try {
        const stored = safeJSONParse(localStorage.getItem('app_complaints'), []);
        const updated = [{ id: newComplaintId, ...newComplaintData }, ...stored];
        localStorage.setItem('app_complaints', JSON.stringify(updated));
      } catch (e) {}

      // 5. Success state
      setIsSubmitting(false);
      setIsSuccess(true);
      setSuccessJobId(newComplaintId);

      // WhatsApp Notification
      const currentHour = new Date().getHours();
      const isClosed = currentHour < 9 || currentHour >= 21;
      const hoursMessage = isClosed ? '\n\n*Note:* Our shop is currently closed. Our technician will connect with you first thing tomorrow morning.' : '';
      const receiptMessage = `*🛠️ Booking Confirmed!*\n\n*Job ID:* ${newComplaintId.substring(0, 8).toUpperCase()}\n*Name:* ${name}\n*Appliance:* ${product}\n*Issue:* ${issue}\n*Timeslot:* ${timeslot}\n*Status:* Pending\n*Location:* ${addressInput}\n\n*Cost Estimate:*\nHome Visit Charge: ₹${pricing.homeVisitCharge}\nService Fee: ₹${serviceFee}\n${applyCoins ? `Coins Discount: -₹${discount}\n` : ''}*Estimated Total: ₹${estTotal}*\n(Note: Spare parts/hardware replacement charges are extra if required)${hoursMessage}\n\nThank you for choosing Sachin Electricals!`;
      
      const whatsappUrl = `https://wa.me/${adminPhone}?text=${encodeURIComponent(receiptMessage)}`;
      try {
        window.open(whatsappUrl, '_blank');
      } catch(e) {}
      
      // Reset form states ONLY upon confirmed successful save
      try { formElement.reset(); } catch (e) {}
      setNameText('');
      setPincodeText('');
      setPhoneText('');
      setAddressText('');
      setIssueText('');
      setCustomProduct('');
      setSelectedProduct('');
      setSelectedServiceRateId('');
      setIssueImage(null);
      setApplyCoins(false);

    } catch (error: any) {
      console.error("Error submitting report:", error);
      setIsSubmitting(false);
      // Keep user input intact and display the actual useful error message
      setErrorMessage(error?.message || "Failed to submit report. Please check your network and try again.");
    }
  };

  const handleTrackComplaint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trackPhone.trim()) return;
    setIsTracking(true);
    try {
      let complaints: Complaint[] = [];
      const cleanSearch = trackPhone.trim().replace(/[^0-9a-zA-Z]/g, '').toLowerCase();

      // 1. Fetch from Cloud Firestore
      try {
        const snapshot = await getDocs(collection(db, 'complaints'));
        if (!snapshot.empty) {
          const fsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Complaint[];
          const remoteComplaints = fsData.filter((c: any) => {
            const cPhone = String(c.phone || c.mobile || '').replace(/[^0-9]/g, '');
            const cId = String(c.id || '').toLowerCase();
            return cPhone.endsWith(cleanSearch) || cPhone === cleanSearch || cId === cleanSearch || cId.startsWith(cleanSearch);
          });
          complaints = remoteComplaints;
        }
      } catch (fsErr) {
        console.warn('Firestore tracking fetch error', fsErr);
      }

      // 2. Merge with RTDB if available
      try {
        const snapshot = await get(ref(rtdb, 'complaints'));
        if (snapshot.exists()) {
          const val = snapshot.val();
          const rtdbData = Object.keys(val).map(key => ({ id: key, ...val[key] })) as Complaint[];
          const remoteComplaints = rtdbData.filter((c: any) => {
            const cPhone = String(c.phone || c.mobile || '').replace(/[^0-9]/g, '');
            const cId = String(c.id || '').toLowerCase();
            return cPhone.endsWith(cleanSearch) || cPhone === cleanSearch || cId === cleanSearch;
          });
          const all = [...complaints, ...remoteComplaints];
          complaints = [...new Map(all.map(item => [item.id, item])).values()];
        }
      } catch (e) {}

      // 3. Merge with local storage fallback
      try {
        const local = safeJSONParse(localStorage.getItem('app_complaints'), []);
        const localMatches = local.filter((c: any) => {
          const cPhone = String(c.phone || c.mobile || '').replace(/[^0-9]/g, '');
          const cId = String(c.id || '').toLowerCase();
          return cPhone.endsWith(cleanSearch) || cPhone === cleanSearch || cId === cleanSearch;
        });
        const all = [...complaints, ...localMatches];
        complaints = [...new Map(all.map(item => [item.id, item])).values()];
      } catch (e) {}

      setTrackedComplaints(complaints.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    } catch (error) {
      console.warn("Error tracking complaints:", error);
      alert("Failed to find complaints.");
    } finally {
      setIsTracking(false);
    }
  };

  return (
    <section id="complaint" className="relative py-20 bg-blue-50 overflow-hidden">
      <div className="absolute inset-0 z-0">
        <img src={complaintBgImg} alt="Background" className="w-full h-full object-cover opacity-20" />
      </div>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        
        <div className="flex justify-center mb-8">
          <div className="bg-white rounded-full p-1 shadow-md inline-flex">
            <button 
              onClick={() => setActiveTab('book')}
              className={`px-8 py-3 rounded-full text-sm font-bold transition-colors ${activeTab === 'book' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:text-blue-600 hover:bg-slate-50'}`}
            >
              Book a Repair
            </button>
            <button 
              onClick={() => { setActiveTab('track'); setTrackedComplaints(null); }}
              className={`px-8 py-3 rounded-full text-sm font-bold transition-colors ${activeTab === 'track' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:text-blue-600 hover:bg-slate-50'}`}
            >
              Track Status
            </button>
          </div>
        </div>

        <div className="bg-white rounded-3xl shadow-xl overflow-hidden flex flex-col md:flex-row min-h-[600px]">
          <div className="bg-blue-600 text-white p-10 md:w-2/5 flex flex-col justify-between">
            {activeTab === 'book' ? (
              <div>
                <h3 className="text-3xl font-bold mb-4">Book a Repair</h3>
                <p className="text-blue-100 mb-8 leading-relaxed">
                  Facing issues with your appliance? Log a complaint here and our expert technician will contact you shortly to fix it at your doorstep.
                </p>
                <div className="space-y-4 mt-8">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-6 w-6 text-blue-300" />
                    <span className="font-medium">Same day service</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-6 w-6 text-blue-300" />
                    <span className="font-medium">Transparent pricing</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-6 w-6 text-blue-300" />
                    <span className="font-medium">Genuine spare parts</span>
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <h3 className="text-3xl font-bold mb-4">Track Repair Status</h3>
                <p className="text-blue-100 mb-8 leading-relaxed">
                  Enter your registered phone number to check the status of your complaints, and view detailed resolution summaries including replaced parts.
                </p>
                <div className="space-y-4 mt-8">
                  <div className="flex items-center gap-3">
                    <Clock className="h-6 w-6 text-blue-300" />
                    <span className="font-medium">Real-time updates</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Wrench className="h-6 w-6 text-blue-300" />
                    <span className="font-medium">View replaced parts</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-6 w-6 text-blue-300" />
                    <span className="font-medium">Repair cost transparency</span>
                  </div>
                </div>
              </div>
            )}
          </div>
          
          <div className="p-10 md:w-3/5">
            {activeTab === 'book' ? (
              isSuccess ? (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="h-full flex flex-col items-center justify-center text-center space-y-4"
                >
                  <div className="h-20 w-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-4">
                    <CheckCircle2 className="h-10 w-10" />
                  </div>
                  <h4 className="text-2xl font-bold text-slate-900">Request Received!</h4>
                  <p className="text-slate-600 mb-1">Your complaint has been registered and saved successfully.</p>
                  {successJobId && (
                    <div className="bg-blue-50 border border-blue-200 px-4 py-2 rounded-xl text-blue-900 font-mono text-sm font-bold">
                      Job ID: #{successJobId.substring(0, 8).toUpperCase()}
                    </div>
                  )}
                  {isClosed ? (
                    <p className="text-blue-700 bg-blue-50 px-4 py-2 rounded-lg text-sm font-medium">
                      Our shop is currently closed. Our technician will connect with you first thing tomorrow morning.
                    </p>
                  ) : (
                    <p className="text-slate-600">Our team will contact you shortly.</p>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setIsSuccess(false);
                      setSuccessJobId('');
                    }}
                    className="mt-4 px-6 py-2.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors shadow-md text-sm"
                  >
                    + Book Another Repair
                  </button>
                </motion.div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label htmlFor="name" className="block text-sm font-semibold text-slate-700">Customer Name</label>
                      <VoiceInput 
                        isListening={isListeningName}
                        setIsListening={setIsListeningName}
                        onResult={(text) => setNameText(prev => prev ? `${prev} ${text}` : text)}
                      />
                    </div>
                    <input required type="text" name="name" id="name" value={nameText} onChange={(e) => setNameText(e.target.value)} minLength={2} maxLength={50} pattern="[A-Za-z \.]+" title="Please enter a valid name using letters and spaces" className="w-full px-4 py-3 bg-slate-50 rounded-xl border border-slate-200 focus:bg-white focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-all" placeholder="Enter your full name" />
                  </div>
                  
                  
                  <div>
                    <label htmlFor="pincode" className="block text-sm font-semibold text-slate-700 mb-2">PIN Code</label>
                    <input required type="text" name="pincode" id="pincode" value={pincodeText} onChange={(e) => setPincodeText(e.target.value)} minLength={6} maxLength={6} pattern="[0-9]{6}" className="w-full px-4 py-3 bg-slate-50 rounded-xl border border-slate-200 focus:bg-white focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-all" placeholder="Enter 6-digit PIN code" />
                  </div>

                  <div>
                    <label htmlFor="phone" className="block text-sm font-semibold text-slate-700 mb-2">Phone / WhatsApp Number</label>
                    <input required type="tel" name="phone" id="phone" value={phoneText} onChange={(e) => { setPhoneText(e.target.value); if(e.target.value.length === 10) checkLoyalty(e.target.value); }} minLength={10} maxLength={10} pattern="[0-9]{10}" title="Please enter a valid 10-digit phone number" className="w-full px-4 py-3 bg-slate-50 rounded-xl border border-slate-200 focus:bg-white focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-all" placeholder="Enter your 10-digit number" />
                  </div>
                  
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label htmlFor="address" className="block text-sm font-semibold text-slate-700">Address / Pata</label>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleGetLocation}
                          disabled={isLocating}
                          className="flex items-center gap-1 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
                        >
                          <Navigation className={`w-3.5 h-3.5 ${isLocating ? 'animate-pulse' : ''}`} />
                          {isLocating ? 'Locating...' : 'Use Current Location'}
                        </button>
                        <VoiceInput 
                          isListening={isListeningAddress}
                          setIsListening={setIsListeningAddress}
                          onResult={(text) => setAddressText(prev => prev ? `${prev} ${text}` : text)}
                        />
                      </div>
                    </div>
                    <textarea required name="address" id="address" value={addressText} onChange={(e) => setAddressText(e.target.value)} rows={2} minLength={10} maxLength={300} className="w-full px-4 py-3 bg-slate-50 rounded-xl border border-slate-200 focus:bg-white focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-all resize-none" placeholder="Enter your full address (house no, street, area, etc.)"></textarea>
                  </div>
                  
                  <div>
                    <label htmlFor="product" className="block text-sm font-semibold text-slate-700 mb-2">Product / Appliance Name</label>
                    <select required name="product" id="product" value={selectedProduct} onChange={(e) => { setSelectedProduct(e.target.value); setSelectedServiceRateId(''); }} className="w-full px-4 py-3 bg-slate-50 rounded-xl border border-slate-200 focus:bg-white focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-all appearance-none cursor-pointer">
                      <option value="">Select an appliance...</option>
                      <option value="AC">Air Conditioner (Split/Window)</option>
                      <option value="Cooler">Air Cooler</option>
                      <option value="WashingMachine">Washing Machine</option>
                      <option value="Refrigerator">Refrigerator</option>
                      <option value="Fan">Ceiling/Table Fan</option>
                      <option value="Microwave">Microwave Oven</option>
                      <option value="HouseWiring">House Wiring & Electrical</option>
                      <option value="Other">Other Electrical Item</option>
                    </select>
                  </div>
                  {selectedProduct === 'Other' && (
                    <div className="animate-[fadeIn_0.3s_ease-out]">
                      <label htmlFor="customProduct" className="block text-sm font-semibold text-slate-700 mb-2">Please Specify Product / Appliance Name</label>
                      <input required type="text" name="customProduct" id="customProduct" value={customProduct} onChange={(e) => setCustomProduct(e.target.value)} className="w-full px-4 py-3 bg-slate-50 rounded-xl border border-slate-200 focus:bg-white focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-all" placeholder="E.g., Geyser, Mixer Grinder, Inverter" />
                    </div>
                  )}
                  
                  
                  {serviceRates.filter(r => r.applianceCategory === selectedProduct || (selectedProduct === 'Other' && r.applianceCategory === customProduct)).length > 0 && (
                    <div className="animate-[fadeIn_0.3s_ease-out]">
                      <label htmlFor="serviceRate" className="block text-sm font-semibold text-slate-700 mb-2">Select Specific Service (Optional)</label>
                      <select name="serviceRate" id="serviceRate" value={selectedServiceRateId} onChange={(e) => setSelectedServiceRateId(e.target.value)} className="w-full px-4 py-3 bg-slate-50 rounded-xl border border-slate-200 focus:bg-white focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-all appearance-none cursor-pointer">
                        <option value="">General Checking / Other</option>
                        {serviceRates.filter(r => r.applianceCategory === selectedProduct || (selectedProduct === 'Other' && r.applianceCategory === customProduct)).map(rate => (
                          <option key={rate.id} value={rate.id}>{rate.serviceType} - ₹{rate.baseRepairingCost}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="priority" className="block text-sm font-semibold text-slate-700 mb-2">Priority Level</label>
                      <select required name="priority" id="priority" defaultValue="Normal" className="w-full px-4 py-3 bg-slate-50 rounded-xl border border-slate-200 focus:bg-white focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-all appearance-none cursor-pointer">
                        <option value="Normal">Normal</option>
                        <option value="Urgent">Urgent</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="timeslot" className="block text-sm font-semibold text-slate-700 mb-2">Preferred Timeslot</label>
                      <select required name="timeslot" id="timeslot" defaultValue="Morning 10-12 AM" className="w-full px-4 py-3 bg-slate-50 rounded-xl border border-slate-200 focus:bg-white focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-all appearance-none cursor-pointer">
                        <option value="Morning 10-12 AM">Morning (10:00 AM - 12:00 PM)</option>
                        <option value="Afternoon 12-3 PM">Afternoon (12:00 PM - 3:00 PM)</option>
                        <option value="Evening 4-6 PM">Evening (4:00 PM - 6:00 PM)</option>
                      </select>
                    </div>
                  </div>
                  
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label htmlFor="issue" className="block text-sm font-semibold text-slate-700">Issue / Problem Details</label>
                      <VoiceInput 
                        isListening={isListeningIssue}
                        setIsListening={setIsListeningIssue}
                        onResult={(text) => setIssueText(prev => prev ? `${prev} ${text}` : text)}
                      />
                    </div>
                    <textarea 
                      required 
                      name="issue" 
                      id="issue" 
                      rows={3} 
                      value={issueText}
                      onChange={(e) => setIssueText(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 rounded-xl border border-slate-200 focus:bg-white focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-all resize-none mb-3" 
                      placeholder="Please describe what's wrong with the appliance..."
                    ></textarea>
                    
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <input 
                          type="file" 
                          id="issue-image-upload" 
                          accept="image/*" 
                          capture="environment"
                          onChange={handleImageUpload}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        />
                        <button type="button" className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition-colors border border-slate-200">
                          <Camera className="w-4 h-4" />
                          Attach Photo (Optional)
                        </button>
                      </div>
                      
                      {issueImage && (
                        <div className="relative inline-block">
                          <img src={issueImage} alt="Issue preview" className="h-12 w-12 object-cover rounded-lg border border-slate-200 shadow-sm" />
                          <button 
                            type="button"
                            onClick={() => setIssueImage(null)} 
                            className="absolute -top-2 -right-2 bg-red-500 hover:bg-red-600 text-white rounded-full p-1 shadow-sm transition-colors"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="bg-blue-50 border border-blue-100 rounded-xl p-5 mb-6">
                    <h4 className="font-bold text-slate-900 mb-3 flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-blue-600" /> Booking Checkout</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm text-slate-600">
                        <span>Mandatory Home Visit Charge</span>
                        <span className="font-medium text-slate-900">₹{pricing.homeVisitCharge}</span>
                      </div>
                      {selectedProduct && (
                        <div className="flex justify-between text-sm text-slate-600">
                          <span>Service Charge ({selectedServiceRateId ? serviceRates.find(r => r.id === selectedServiceRateId)?.serviceType : (selectedProduct === 'Other' ? customProduct || 'Other' : selectedProduct)})</span>
                          <span className="font-medium text-slate-900">
                            ₹{selectedServiceRateId ? serviceRates.find(r => r.id === selectedServiceRateId)?.baseRepairingCost : (pricing.serviceFees[selectedProduct] !== undefined ? pricing.serviceFees[selectedProduct] : (pricing.serviceFees['Other'] || 100))}
                          </span>
                        </div>
                      )}
                      {loyaltyCoins > 0 && (
                        <div className="flex justify-between items-center text-sm text-slate-600 border-t border-blue-100 pt-2 mt-2">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={applyCoins} onChange={(e) => setApplyCoins(e.target.checked)} className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500" />
                            <span>Use {loyaltyCoins} Loyalty Coins (₹{Math.floor(loyaltyCoins / 10)})</span>
                          </label>
                          <span className="font-medium text-green-600">
                            {applyCoins ? `-₹${Math.floor(loyaltyCoins / 10)}` : '₹0'}
                          </span>
                        </div>
                      )}
                      
                      <div className="flex justify-between font-bold text-lg text-slate-900 border-t border-blue-200 mt-3 pt-3">
                        <span>Estimated Total</span>
                        <span>₹{Math.max(0, pricing.homeVisitCharge + (selectedProduct ? (selectedServiceRateId ? (serviceRates.find(r => r.id === selectedServiceRateId)?.baseRepairingCost || 0) : (pricing.serviceFees[selectedProduct] !== undefined ? pricing.serviceFees[selectedProduct] : (pricing.serviceFees['Other'] || 100))) : 0) - (applyCoins ? Math.floor(loyaltyCoins / 10) : 0))}</span>
                      </div>
                    </div>
                    <div className="mt-4 p-3 bg-amber-50 rounded-lg border border-amber-100 flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                      <p className="text-xs text-amber-800 leading-relaxed font-medium">
                        Spare parts / hardware component replacement charges will be extra if required during repair.
                      </p>
                    </div>
                  </div>

                  {errorMessage && (
                    <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-start gap-3 animate-[fadeIn_0.3s_ease-out]">
                      <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
                      <div>
                        <p className="font-bold text-red-800">Submission Failed</p>
                        <p className="text-xs text-red-700 mt-0.5">{errorMessage}</p>
                      </div>
                    </div>
                  )}

                  <button 
                    type="submit" 
                    disabled={isSubmitting}
                    className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl shadow-lg shadow-blue-600/30 hover:bg-blue-700 hover:shadow-xl hover:shadow-blue-600/40 transition-all disabled:opacity-70 disabled:cursor-not-allowed flex justify-center items-center gap-2 btn-3d btn-3d-blue"
                  >
                    {isSubmitting ? (
                      <>
                        <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        Submitting...
                      </>
                    ) : (
                      'Submit Complaint'
                    )}
                  </button>
                </form>
              )
            ) : (
              <div className="h-full flex flex-col">
                <form onSubmit={handleTrackComplaint} className="mb-8">
                  <label htmlFor="trackPhone" className="block text-sm font-semibold text-slate-700 mb-2">Enter Phone Number or Job Card ID</label>
                  <div className="flex gap-2">
                    <input 
                      required 
                      type="text" 
                      value={trackPhone}
                      onChange={(e) => setTrackPhone(e.target.value)}
                      minLength={4}
                      maxLength={20}
                      pattern="[A-Za-z0-9\-]+"
                      title="Please enter a valid phone number or Job ID (alphanumeric and dashes only)"
                      className="flex-1 px-4 py-3 bg-slate-50 rounded-xl border border-slate-200 focus:bg-white focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-all" 
                      placeholder="e.g. 9876543210 or JOB-123" 
                    />
                    <button 
                      type="submit"
                      disabled={isTracking}
                      className="bg-blue-600 text-white px-6 py-3 rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-70 flex justify-center items-center btn-3d btn-3d-blue"
                    >
                      {isTracking ? (
                        <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      ) : (
                        <Search className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                </form>

                {trackedComplaints && (
                  <div className="flex-1 overflow-y-auto pr-2 space-y-4">
                    {trackedComplaints.length === 0 ? (
                      <div className="text-center py-10 text-slate-500">
                        <AlertCircle className="h-10 w-10 mx-auto mb-3 text-slate-300" />
                        <p>No complaints found for this search.</p>
                      </div>
                    ) : (
                      trackedComplaints.map((c) => (
                        <div key={c.id} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm transform transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
                          <div className="flex justify-between items-start mb-3">
                            <div>
                              <h5 className="font-bold text-slate-900">{c.product}</h5>
                              <p className="text-xs text-slate-500">ID: {c.id?.substring(0,8).toUpperCase()} | {new Date(c.createdAt).toLocaleDateString()}</p>
                            </div>
                            <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${
                              c.status === 'Resolved' || c.status === 'Completed' ? 'bg-slate-200 text-slate-700' :
                              c.status === 'Ready for Delivery' ? 'bg-green-100 text-green-700' :
                              c.status === 'Pending' ? 'bg-yellow-100 text-yellow-700' :
                              'bg-blue-100 text-blue-700'
                            }`}>
                              {c.status}
                            </span>
                          </div>
                          
                          <p className="text-sm text-slate-600 mb-4 bg-slate-50 p-3 rounded-lg border border-slate-100">
                            <span className="font-medium">Issue:</span> {c.issue}
                          </p>

                          {(c.assignedTechnicianName || (c as any).assignedTo) && (
                            <div className="mb-4 bg-blue-50/80 p-3 rounded-lg border border-blue-100 flex items-center justify-between">
                              <div>
                                <span className="text-xs font-bold text-blue-700 uppercase tracking-wider block">Assigned Technician:</span>
                                <span className="text-sm font-bold text-slate-800">{c.assignedTechnicianName || (c as any).assignedTo}</span>
                              </div>
                              <span className="px-2 py-0.5 bg-blue-200 text-blue-800 font-bold text-[10px] rounded-full">Senior Technician</span>
                            </div>
                          )}

                          {(c as any).technicianRemark && (
                            <div className="mb-4 bg-amber-50 p-3 rounded-lg border border-amber-200">
                              <span className="text-xs font-bold text-amber-800 block">Technician Note / Remark:</span>
                              <p className="text-xs text-amber-900 mt-0.5">{(c as any).technicianRemark}</p>
                            </div>
                          )}

                          {c.statusUpdates && c.statusUpdates.length > 0 && (
                            <div className="mb-4">
                              <h6 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-1.5">
                                <Clock className="w-4 h-4 text-blue-600" /> Status Updates
                              </h6>
                              <div className="space-y-3 relative before:absolute before:inset-0 before:ml-2 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 before:to-transparent">
                                {c.statusUpdates.map((update, idx) => (
                                  <div key={idx} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                                    <div className="flex items-center justify-center w-4 h-4 rounded-full border border-white bg-slate-200 text-slate-500 shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow" />
                                    <div className="w-[calc(100%-2rem)] md:w-[calc(50%-1.5rem)] bg-slate-50 p-3 rounded-lg border border-slate-100 shadow-sm">
                                      <div className="flex justify-between items-center mb-1">
                                        <span className="font-bold text-slate-900 text-xs">{update.status}</span>
                                        <time className="text-[10px] text-slate-500">{new Date(update.timestamp).toLocaleDateString()}</time>
                                      </div>
                                      <p className="text-xs text-slate-600">{update.note}</p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {c.status === 'Resolved' && c.resolutionDetails && (
                            <div className="border-t border-slate-200 pt-4 mt-2">
                              <h6 className="text-sm font-bold text-slate-900 mb-2 flex items-center gap-1.5">
                                <Wrench className="w-4 h-4 text-blue-600" /> Resolution Details
                              </h6>
                              <div className="grid grid-cols-2 gap-4 mb-3">
                                <div>
                                  <p className="text-xs text-slate-500 mb-1">Old Part</p>
                                  {c.resolutionDetails.oldPartPhoto ? (
                                    <img src={c.resolutionDetails.oldPartPhoto} alt="Old Part" className="h-16 w-full object-cover rounded-md border border-slate-200" />
                                  ) : (
                                    <div className="h-16 w-full bg-slate-100 rounded-md flex items-center justify-center text-xs text-slate-400">No photo</div>
                                  )}
                                </div>
                                <div>
                                  <p className="text-xs text-slate-500 mb-1">New Part</p>
                                  {c.resolutionDetails.newPartPhoto ? (
                                    <img src={c.resolutionDetails.newPartPhoto} alt="New Part" className="h-16 w-full object-cover rounded-md border border-slate-200" />
                                  ) : (
                                    <div className="h-16 w-full bg-slate-100 rounded-md flex items-center justify-center text-xs text-slate-400">No photo</div>
                                  )}
                                </div>
                              </div>
                              <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-600"><span className="font-medium">Replaced:</span> {c.resolutionDetails.replacedPartName}</span>
                                <span className="font-bold text-slate-900">Total: ₹{c.resolutionDetails.totalCost}</span>
                              </div>
                              <button
                                onClick={() => generateInvoice(c)}
                                className="w-full mt-4 flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold py-2 px-4 rounded-lg transition-colors text-sm"
                              >
                                <Download className="w-4 h-4" />
                                Download PDF Invoice
                              </button>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
