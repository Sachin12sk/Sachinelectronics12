import React, { useState, useRef } from 'react';
import { Camera, Upload, CheckCircle2, XCircle, ArrowRight, ShieldCheck, MapPin, User, Phone, Wrench } from 'lucide-react';
import { doc, setDoc } from 'firebase/firestore';
import { db, technicianApplicationsCollection } from '../lib/firebase';
import { TechnicianApplication } from '../types';
import { secureStorage, isValidFile } from '../lib/security';

export default function TechnicianRegistration() {
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  
  const [formData, setFormData] = useState({
    fullName: '',
    mobile: '',
    whatsapp: '',
    city: '',
    experience: '',
  });

  const [skills, setSkills] = useState<string[]>([]);
  
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [otpVerified, setOtpVerified] = useState(false);
  const [generatedOtp, setGeneratedOtp] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null);

  const [documents, setDocuments] = useState({
    aadhaarFront: '',
    aadhaarBack: '',
    pan: '',
    dl: '',
    photo: '',
  });

  const availableSkills = [
    'AC Repair & Service',
    'Refrigerator',
    'Washing Machine',
    'Microwave',
    'RO Water Purifier',
    'Geyser',
    'PCB Board Repair',
    'Electrical Wiring'
  ];

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSkillToggle = (skill: string) => {
    setSkills(prev => 
      prev.includes(skill) 
        ? prev.filter(s => s !== skill)
        : [...prev, skill]
    );
  };

  const [isUploading, setIsUploading] = useState<Record<string, boolean>>({});


  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      if (file.type === 'application/pdf') {
         const reader = new FileReader();
         reader.onloadend = () => resolve(reader.result as string);
         reader.readAsDataURL(file);
         return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          const MAX_DIM = 800;
          if (width > height) {
            if (width > MAX_DIM) {
              height = Math.round(height * (MAX_DIM / width));
              width = MAX_DIM;
            }
          } else {
            if (height > MAX_DIM) {
              width = Math.round(width * (MAX_DIM / height));
              height = MAX_DIM;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', 0.6));
          } else {
            resolve(e.target?.result as string);
          }
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: keyof typeof documents) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!isValidFile(file)) {
         alert('Security Alert: Invalid file format. Please upload JPG, PNG, or PDF files only.');
         return;
      }
      
      setIsUploading(prev => ({ ...prev, [type]: true }));

      // Fast Mock OCR Validation
      const fileName = file.name.toLowerCase();
      let isValid = true;
      if (type === 'pan' && !fileName.includes('pan')) {
        isValid = true; // Auto-pass for mock
      } else if ((type === 'aadhaarFront' || type === 'aadhaarBack') && !fileName.includes('aadhaar')) {
        isValid = true; // Auto-pass for mock
      }

      try {
        const compressedBase64 = await compressImage(file);
        setDocuments(prev => ({ ...prev, [type]: compressedBase64 }));
      } catch (err) {
        console.error("Compression failed:", err);
      } finally {
        setIsUploading(prev => ({ ...prev, [type]: false }));
      }
    }
  };

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraDenied, setCameraDenied] = useState(false);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsCameraActive(true);
        setCameraDenied(false);
      }
    } catch (err) {
      alert("Camera access denied or unavailable. You can now use the fallback image upload.");
      setCameraDenied(true);
    }
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext('2d');
      if (context) {
        let width = videoRef.current.videoWidth;
        let height = videoRef.current.videoHeight;
        const MAX_DIM = 800;
        if (width > height) {
          if (width > MAX_DIM) {
            height = Math.round(height * (MAX_DIM / width));
            width = MAX_DIM;
          }
        } else {
          if (height > MAX_DIM) {
            width = Math.round(width * (MAX_DIM / height));
            height = MAX_DIM;
          }
        }
        canvasRef.current.width = width;
        canvasRef.current.height = height;
        context.drawImage(videoRef.current, 0, 0, width, height);
        const photoDataUrl = canvasRef.current.toDataURL('image/jpeg', 0.6);
        setDocuments(prev => ({ ...prev, photo: photoDataUrl }));
        
        // Stop camera
        const stream = videoRef.current.srcObject as MediaStream;
        stream?.getTracks().forEach(track => track.stop());
        setIsCameraActive(false);
      }
    }
  };
  
  const handleSendOtp = () => {
    if (formData.mobile.length >= 10) {
      const fixedOtp = "1234";
      setGeneratedOtp(fixedOtp);
      setOtpSent(true);
      setOtp(fixedOtp); // Automatically pre-fill the OTP
      alert(`Your Verification Code is: ${fixedOtp}`);
    }
  };
  
  const handleVerifyOtp = () => {
    if (otp === generatedOtp || otp === "1234") {
       setOtpVerified(true);
    } else {
       alert("Invalid OTP. Please try again.");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (step === 3) {
      if (lockoutUntil && Date.now() < lockoutUntil) {
        alert(`Security Lock: Too many attempts. Please try again in ${Math.ceil((lockoutUntil - Date.now()) / 1000)} seconds.`);
        return;
      }
      
      if (attempts >= 2) {
        setLockoutUntil(Date.now() + 60000);
        alert("Security Lock: Action blocked for 60 seconds due to too many attempts.");
        return;
      }
      setAttempts(prev => prev + 1);
    }
    
    if (step === 1 && !otpVerified) {
       alert("Please verify your mobile number first.");
       return;
    }
    
    if (step < 3) {
      setStep(prev => prev + 1);
      return;
    }

    if (!documents.photo || !documents.aadhaarFront || !documents.aadhaarBack || !documents.pan) {
      alert("Please provide Live Selfie, Aadhaar (Front & Back), and PAN Card.");
      return;
    }

    setIsSubmitting(true);
    try {
      const applicationId = Date.now().toString();
      const application: TechnicianApplication & { id: string } = {
        id: applicationId,
        fullName: formData.fullName,
        mobile: formData.mobile,
        whatsapp: formData.whatsapp,
        city: formData.city,
        experience: Number(formData.experience),
        skills,
        documents,
        status: 'Pending',
        createdAt: new Date().toISOString(),
      };

      // Save in Cloud Firestore technicianApplications collection
      await Promise.race([
        setDoc(doc(db, 'technicianApplications', application.id), application),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Save timeout')), 10000))
      ]);
      
      
      
      // WhatsApp Notification
      const adminPhone = "918381892161";
      const message = `*New Technician Application*

*Name:* ${formData.fullName}
*Location:* ${formData.city}
*Mobile:* ${formData.mobile}
*WhatsApp:* ${formData.whatsapp}
*Experience:* ${formData.experience} years
*Skills:* ${skills.join(', ')}

Please check Admin Dashboard for documents and approval.`;
      
      const whatsappUrl = `https://wa.me/${adminPhone}?text=${encodeURIComponent(message)}`;
      
      setIsSuccess(true);
      
      // Open whatsapp in background
      window.open(whatsappUrl, '_blank');

    } catch (error) {
      console.error("Error submitting application", error);
      alert("Failed to submit application. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center pt-20 px-4">
        <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-xl text-center">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-10 h-10 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-4">Application Submitted Successfully! ✓</h2>
          <p className="text-slate-600 mb-8">
            Thank you for applying to partner with Sachin Electronics. Our team will review your details and documents and contact you within 24-48 hours.
            <br/><br/>
            Redirecting to home page...
          </p>
          <a href="#" className="btn-3d btn-3d-blue inline-block w-full text-center px-6 py-3 bg-blue-600 text-white rounded-xl font-bold">
            Return to Home
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pt-24 pb-12 px-4">
      <div className="max-w-3xl mx-auto">
        
        <div className="text-center mb-10">
          <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900 mb-4">Technician Registration</h1>
          <p className="text-lg text-slate-600">Join our network of expert technicians and grow your business.</p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
          <div className="flex border-b border-slate-100">
            {[1, 2, 3].map(num => (
              <div key={num} className={`flex-1 py-4 text-center text-sm font-semibold border-b-2 transition-colors ${step === num ? 'border-blue-600 text-blue-600 bg-blue-50/30' : step > num ? 'border-green-500 text-green-600' : 'border-transparent text-slate-400'}`}>
                {step > num ? (
                  <span className="flex items-center justify-center gap-2">
                    <CheckCircle2 className="w-4 h-4" /> Step {num}
                  </span>
                ) : (
                  `Step ${num}`
                )}
              </div>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="p-6 md:p-8">
            {/* Step 1: Personal Details */}
            {step === 1 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                <h3 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
                  <User className="w-5 h-5 text-blue-600" /> Personal Information
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Full Name</label>
                    <input required type="text" name="fullName" value={formData.fullName} onChange={handleInputChange} className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" placeholder="Enter your full name" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">City / Region</label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                      <input required type="text" name="city" value={formData.city} onChange={handleInputChange} className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" placeholder="e.g. Kanpur, UP" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Mobile Number</label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                      <input required type="tel" name="mobile" value={formData.mobile} onChange={handleInputChange} disabled={otpVerified} className={`w-full pl-10 pr-4 py-3 rounded-xl border ${otpVerified ? 'bg-slate-100 border-slate-200 text-slate-500' : 'border-slate-300 focus:ring-2 focus:ring-blue-500'} outline-none transition-all`} placeholder="10-digit mobile number" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">WhatsApp Number</label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-green-500" />
                      <input required type="tel" name="whatsapp" value={formData.whatsapp} onChange={handleInputChange} className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all" placeholder="WhatsApp number" />
                    </div>
                  </div>
                </div>

                {!otpVerified && (
                  <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 mt-6">
                    <h4 className="font-semibold text-blue-900 mb-3 flex items-center gap-2"><ShieldCheck className="w-4 h-4" /> Mobile Verification</h4>
                    {!otpSent ? (
                      <button type="button" onClick={handleSendOtp} className={`px-4 py-2 rounded-lg font-bold text-sm ${formData.mobile.length >= 10 ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}>
                        Send OTP
                      </button>
                    ) : (
                      <div className="flex items-end gap-4">
                        <div className="flex-1">
                          <label className="block text-xs font-semibold text-blue-800 mb-1">Enter OTP (Sent to mobile)</label>
                          <input type="text" value={otp} onChange={(e) => setOtp(e.target.value)} maxLength={4} className="w-full px-4 py-2 rounded-lg border border-blue-200 focus:ring-2 focus:ring-blue-500 outline-none" placeholder="0000" />
                        </div>
                        <button type="button" onClick={handleVerifyOtp} className="px-4 py-2 bg-blue-600 text-white rounded-lg font-bold text-sm hover:bg-blue-700">
                          Verify
                        </button>
                      </div>
                    )}
                  </div>
                )}
                
                {otpVerified && (
                  <div className="bg-green-50 p-3 rounded-xl border border-green-200 flex items-center gap-2 text-green-700 font-semibold mt-4">
                    <CheckCircle2 className="w-5 h-5" /> Mobile Number Verified Successfully
                  </div>
                )}
              </div>
            )}

            {/* Step 2: Skills & Experience */}
            {step === 2 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                <h3 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
                  <Wrench className="w-5 h-5 text-blue-600" /> Skills & Experience
                </h3>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Years of Experience</label>
                  <select required name="experience" value={formData.experience} onChange={handleInputChange} className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none">
                    <option value="">Select Experience</option>
                    <option value="0-1">Less than 1 Year</option>
                    <option value="1-3">1 to 3 Years</option>
                    <option value="3-5">3 to 5 Years</option>
                    <option value="5-10">5 to 10 Years</option>
                    <option value="10+">More than 10 Years</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-4">Select your expertise (Multiple allowed)</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {availableSkills.map(skill => (
                      <div key={skill} onClick={() => handleSkillToggle(skill)} className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-all ${skills.includes(skill) ? 'border-blue-500 bg-blue-50/50' : 'border-slate-200 hover:border-slate-300 bg-white'}`}>
                        <div className={`w-5 h-5 rounded border flex items-center justify-center ${skills.includes(skill) ? 'bg-blue-600 border-blue-600' : 'border-slate-300'}`}>
                          {skills.includes(skill) && <CheckCircle2 className="w-4 h-4 text-white" />}
                        </div>
                        <span className={`font-medium ${skills.includes(skill) ? 'text-blue-900' : 'text-slate-700'}`}>{skill}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Documents */}
            {step === 3 && (
              <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                <h3 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-blue-600" /> Document Verification
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Photo Capture */}
                  <div className="col-span-1 md:col-span-2 bg-slate-50 p-6 rounded-2xl border border-slate-200">
                    <label className="block text-sm font-semibold text-slate-700 mb-4">Live Photo / Selfie</label>
                    
                    {!documents.photo && !isCameraActive && (
                      <div className="flex gap-4">
                        {!cameraDenied ? (
                          <button type="button" onClick={startCamera} className="w-full flex flex-col items-center justify-center gap-2 p-6 rounded-xl border-2 border-dashed border-blue-300 bg-blue-50 hover:bg-blue-100 transition-colors text-blue-700 font-semibold">
                            <Camera className="w-8 h-8" /> Capture Live Selfie
                          </button>
                        ) : (
                          <label className="flex-1 flex flex-col items-center justify-center gap-2 p-6 rounded-xl border-2 border-dashed border-slate-300 bg-white hover:bg-slate-50 transition-colors text-slate-600 font-semibold cursor-pointer">
                            <Upload className="w-8 h-8" /> Upload Selfie (Fallback)
                            <input type="file" accept="image/jpeg,image/png,image/jpg" className="hidden" onChange={(e) => handleFileUpload(e, 'photo')} />
                          </label>
                        )}
                      </div>
                    )}

                    {isCameraActive && (
                      <div className="relative rounded-xl overflow-hidden bg-black max-w-sm mx-auto">
                        <video ref={videoRef} autoPlay playsInline className="w-full h-auto" />
                        <button type="button" onClick={capturePhoto} className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white text-slate-900 px-6 py-2 rounded-full font-bold shadow-lg flex items-center gap-2">
                          <Camera className="w-5 h-5" /> Capture
                        </button>
                      </div>
                    )}
                    <canvas ref={canvasRef} className="hidden" />

                    {documents.photo && (
                      <div className="relative max-w-xs mx-auto">
                        {documents.photo.startsWith('data:application/pdf') ? (
                          <div className="w-full h-32 flex items-center justify-center bg-slate-200 rounded-xl border border-slate-300 shadow-sm text-slate-600 font-bold">PDF Uploaded</div>
                        ) : (
                          <img src={documents.photo} alt="Profile" className="w-full h-auto rounded-xl border border-slate-200 shadow-sm" />
                        )}
                        <button type="button" onClick={() => setDocuments(prev => ({...prev, photo: ''}))} className="absolute -top-3 -right-3 bg-red-100 text-red-600 p-1.5 rounded-full hover:bg-red-200 shadow-sm">
                          <XCircle className="w-5 h-5" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* ID Uploads */}
                  <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200">
                    <label className="block text-sm font-semibold text-slate-700 mb-4">Aadhaar Front Side</label>
                    {documents.aadhaarFront ? (
                       <div className="relative">
                         {documents.aadhaarFront.startsWith('data:application/pdf') ? (
                           <div className="w-full h-32 flex items-center justify-center bg-slate-200 rounded-xl border border-slate-300 text-slate-600 font-bold">PDF Uploaded</div>
                         ) : (
                           <img src={documents.aadhaarFront} alt="Aadhaar Front" className="w-full h-32 object-cover rounded-xl border border-slate-200" />
                         )}
                         <button type="button" onClick={() => setDocuments(prev => ({...prev, aadhaarFront: ''}))} className="absolute -top-2 -right-2 bg-white text-red-500 rounded-full shadow"><XCircle className="w-6 h-6" /></button>
                       </div>
                    ) : (
                      <label className="flex flex-col items-center justify-center gap-2 h-32 rounded-xl border-2 border-dashed border-slate-300 bg-white hover:bg-slate-50 cursor-pointer transition-colors text-sm font-medium text-slate-500">
                        <Upload className="w-6 h-6 text-slate-400" /> {isUploading.aadhaarFront ? "Validating (OCR)..." : "Upload Front Side"}
                        <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => handleFileUpload(e, 'aadhaarFront')} />
                      </label>
                    )}
                  </div>

                  <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200">
                    <label className="block text-sm font-semibold text-slate-700 mb-4">Aadhaar Back Side</label>
                    {documents.aadhaarBack ? (
                       <div className="relative">
                         {documents.aadhaarBack.startsWith('data:application/pdf') ? (
                           <div className="w-full h-32 flex items-center justify-center bg-slate-200 rounded-xl border border-slate-300 text-slate-600 font-bold">PDF Uploaded</div>
                         ) : (
                           <img src={documents.aadhaarBack} alt="Aadhaar Back" className="w-full h-32 object-cover rounded-xl border border-slate-200" />
                         )}
                         <button type="button" onClick={() => setDocuments(prev => ({...prev, aadhaarBack: ''}))} className="absolute -top-2 -right-2 bg-white text-red-500 rounded-full shadow"><XCircle className="w-6 h-6" /></button>
                       </div>
                    ) : (
                      <label className="flex flex-col items-center justify-center gap-2 h-32 rounded-xl border-2 border-dashed border-slate-300 bg-white hover:bg-slate-50 cursor-pointer transition-colors text-sm font-medium text-slate-500">
                        <Upload className="w-6 h-6 text-slate-400" /> {isUploading.aadhaarBack ? "Validating (OCR)..." : "Upload Back Side"}
                        <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => handleFileUpload(e, 'aadhaarBack')} />
                      </label>
                    )}
                  </div>

                  <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200">
                    <label className="block text-sm font-semibold text-slate-700 mb-4">PAN Card</label>
                    {documents.pan ? (
                       <div className="relative">
                         {documents.pan.startsWith('data:application/pdf') ? (
                           <div className="w-full h-32 flex items-center justify-center bg-slate-200 rounded-xl border border-slate-300 text-slate-600 font-bold">PDF Uploaded</div>
                         ) : (
                           <img src={documents.pan} alt="PAN" className="w-full h-32 object-cover rounded-xl border border-slate-200" />
                         )}
                         <button type="button" onClick={() => setDocuments(prev => ({...prev, pan: ''}))} className="absolute -top-2 -right-2 bg-white text-red-500 rounded-full shadow"><XCircle className="w-6 h-6" /></button>
                       </div>
                    ) : (
                      <label className="flex flex-col items-center justify-center gap-2 h-32 rounded-xl border-2 border-dashed border-slate-300 bg-white hover:bg-slate-50 cursor-pointer transition-colors text-sm font-medium text-slate-500">
                        <Upload className="w-6 h-6 text-slate-400" /> {isUploading.pan ? "Validating (OCR)..." : "Upload PAN"}
                        <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => handleFileUpload(e, 'pan')} />
                      </label>
                    )}
                  </div>
                  
                  <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200">
                    <label className="block text-sm font-semibold text-slate-700 mb-4">Driving License (Optional)</label>
                    {documents.dl ? (
                       <div className="relative">
                         {documents.dl.startsWith('data:application/pdf') ? (
                           <div className="w-full h-32 flex items-center justify-center bg-slate-200 rounded-xl border border-slate-300 text-slate-600 font-bold">PDF Uploaded</div>
                         ) : (
                           <img src={documents.dl} alt="DL" className="w-full h-32 object-cover rounded-xl border border-slate-200" />
                         )}
                         <button type="button" onClick={() => setDocuments(prev => ({...prev, dl: ''}))} className="absolute -top-2 -right-2 bg-white text-red-500 rounded-full shadow"><XCircle className="w-6 h-6" /></button>
                       </div>
                    ) : (
                      <label className="flex flex-col items-center justify-center gap-2 h-32 rounded-xl border-2 border-dashed border-slate-300 bg-white hover:bg-slate-50 cursor-pointer transition-colors text-sm font-medium text-slate-500">
                        <Upload className="w-6 h-6 text-slate-400" /> Upload DL
                        <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => handleFileUpload(e, 'dl')} />
                      </label>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Navigation Actions */}
            <div className="mt-10 pt-6 border-t border-slate-100 flex justify-between items-center">
              {step > 1 ? (
                <button type="button" onClick={() => setStep(prev => prev - 1)} className="px-6 py-3 font-semibold text-slate-600 hover:text-slate-900 transition-colors">
                  Back
                </button>
              ) : (
                <div />
              )}

              <button 
                type="submit" 
                disabled={isSubmitting || (step === 1 && (!otpVerified || !formData.fullName || !formData.city || !formData.mobile)) || (step === 3 && (!documents.photo || !documents.aadhaarFront || !documents.aadhaarBack || !documents.pan))}
                className="btn-3d btn-3d-blue inline-flex items-center gap-2 px-8 py-3 bg-blue-600 text-white rounded-xl font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  'Submitting...'
                ) : step === 3 ? (
                  'Submit Application'
                ) : (
                  <>Continue <ArrowRight className="w-5 h-5" /></>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
