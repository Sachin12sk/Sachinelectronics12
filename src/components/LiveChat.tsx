import { useState, useRef, useEffect } from 'react';
import { push, ref } from 'firebase/database';
import { rtdb } from '../lib/firebase';
import { MessageSquare, X, Send, User, Bot, Loader2, Camera } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

import { complaintsCollection } from '../lib/firebase';
import { addDoc } from 'firebase/firestore';
import VoiceInput from './VoiceInput';
import { isPromptInjection, isValidFile } from '../lib/security';

interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
}

export default function LiveChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([{
    id: '1',
    role: 'model',
    text: 'Hello! Welcome to Sachin Electricals & Repairs. How can I help you today? (नमस्ते! सचिन इलेक्ट्रिकल्स में आपका स्वागत है। मैं आपकी कैसे मदद कर सकता हूँ?)'
  }]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [bookingCompleted, setBookingCompleted] = useState<{name: string, phone: string, product: string, issue: string, id: string} | null>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!isValidFile(file)) {
        alert("Invalid file format. Please upload JPG, PNG, or PDF files only.");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = (event) => {
        const img = new Image();
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
          
          const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
          setUploadedImage(dataUrl);
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };
  
  const [fallbackState, setFallbackState] = useState(0);
  const [fallbackData, setFallbackData] = useState({ name: '', phone: '', product: '', issue: '', address: '' });

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleFallbackStep = (text: string) => {
    let nextState = fallbackState;
    let nextText = '';
    const newData = { ...fallbackData };

    switch (fallbackState) {
      case 1:
        newData.name = text;
        nextState = 2;
        nextText = `Thanks ${text}. What is your Mobile / WhatsApp Number? (आपका मोबाइल नंबर क्या है?)`;
        break;
      case 2:
        newData.phone = text;
        nextState = 3;
        nextText = 'Got it. Which appliance needs repair? (e.g., AC, Refrigerator, Washing Machine) (किस उपकरण में खराबी है?)';
        break;
      case 3:
        newData.product = text;
        nextState = 4;
        nextText = 'Please describe the problem you are facing. (कृपया समस्या का वर्णन करें)';
        break;
      case 4:
        newData.issue = text;
        nextState = 5;
        nextText = 'Almost done! What is your address for the technician visit? (कृपया अपना पता बताएं)';
        break;
      case 5:
        newData.address = text;
        nextState = 6;
        nextText = 'Thank you! I have collected all the details. You can now send your booking details via WhatsApp to confirm.';
        
        const newComplaint = {
          name: newData.name,
          phone: newData.phone,
          address: newData.address,
          product: newData.product,
          issue: newData.issue,
          ...(uploadedImage && { issueImageUrl: uploadedImage }),
          status: 'Pending',
          createdAt: new Date().toISOString()
        };
        
        addDoc(complaintsCollection, newComplaint).then(docRef => {
          setBookingCompleted({
            ...newComplaint,
            id: docRef.id
          });
          // Background sync to RTDB if active
          try { push(ref(rtdb, 'complaints'), newComplaint).catch(() => {}); } catch(e) {}
        }).catch(dbError => {
          console.error("Error saving booking to Firestore:", dbError);
          setBookingCompleted({
            ...newComplaint,
            id: 'REQ-' + Math.floor(Math.random() * 100000)
          });
        });
        break;
    }

    setFallbackData(newData);
    setFallbackState(nextState);
    
    setTimeout(() => {
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'model',
        text: nextText
      }]);
    }, 600);
  };

  const handleSend = async () => {
    if (!input.trim()) return;

    const userText = input.trim();
    const userMessage = { id: Date.now().toString(), role: 'user' as const, text: userText };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    if (fallbackState > 0) {
      handleFallbackStep(userText);
      setIsLoading(false);
      return;
    }

    try {
      // Create history array without the new message for the API
      const history = messages.map(msg => ({ role: msg.role, text: msg.text }));
      
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ history, message: userText })
      });

      if (!response.ok) throw new Error('Network response was not ok');
      
      const data = await response.json();
      
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'model',
        text: data.text
      }]);

      if (data.bookingData) {
        // Automatically save the booking to Firebase
        const newComplaint = {
          name: data.bookingData.name,
          phone: data.bookingData.phone,
          address: data.bookingData.address,
          product: data.bookingData.product,
          issue: data.bookingData.issue,
          ...(uploadedImage && { issueImageUrl: uploadedImage }),
          status: 'Pending',
          createdAt: new Date().toISOString()
        };
        
        try {
          const docRef = await addDoc(complaintsCollection, newComplaint);
          setBookingCompleted({
            ...newComplaint,
            id: docRef.id
          });
          try { push(ref(rtdb, 'complaints'), newComplaint).catch(() => {}); } catch(e) {}
        } catch (dbError) {
          console.error("Error saving booking:", dbError);
        }
      }

    } catch (error) {
      console.error('Error sending message:', error);
      if (fallbackState === 0) {
        setFallbackState(1);
        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          role: 'model',
          text: 'It seems our AI is temporarily offline. I can still help you book a service manually. What is your full name? (हमारा सिस्टम अभी ऑफलाइन है, कृपया बुकिंग के लिए अपना पूरा नाम बताएं?)'
        }]);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const sendWhatsAppJobCard = () => {
    if (!bookingCompleted) return;
    
    const message = `*Sachin Electricals & Repairs*\n\n`
      + `*Job ID:* ${bookingCompleted.id.substring(0, 8)}\n`
      + `*Name:* ${bookingCompleted.name}\n`
      + `*Item:* ${bookingCompleted.product}\n`
      + `*Issue:* ${bookingCompleted.issue}\n\n`
      + `Your service request is confirmed!`;
      
    const whatsappUrl = `https://wa.me/91${bookingCompleted.phone}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
  };

  return (
    <>
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            onClick={() => setIsOpen(true)}
            className="fixed bottom-24 right-6 sm:bottom-6 z-50 bg-blue-600 hover:bg-blue-700 text-white p-4 rounded-full shadow-2xl flex items-center gap-2 group transition-all"
          >
            <MessageSquare className="w-6 h-6" />
            <span className="max-w-0 overflow-hidden whitespace-nowrap group-hover:max-w-xs transition-all duration-300 ease-in-out font-bold">
              Live Chat
            </span>
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-24 right-4 sm:bottom-6 sm:right-6 z-50 w-[92vw] sm:w-[400px] h-[600px] max-h-[80vh] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="bg-blue-600 p-4 text-white flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <div className="bg-white/20 p-2 rounded-full">
                  <Bot className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-lg leading-tight">AI Assistant</h3>
                  <p className="text-xs text-blue-100 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-green-400 inline-block"></span>
                    Online
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setIsOpen(false)}
                className="p-2 hover:bg-white/20 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Chat Area */}
            <div className="flex-1 overflow-y-auto p-4 bg-slate-50 space-y-4">
              {messages.map((msg) => (
                <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {msg.role === 'model' && (
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0 mt-1">
                      <Bot className="w-5 h-5 text-blue-600" />
                    </div>
                  )}
                  <div 
                    className={`px-4 py-3 rounded-2xl max-w-[80%] ${
                      msg.role === 'user' 
                        ? 'bg-blue-600 text-white rounded-tr-none' 
                        : 'bg-white border border-slate-200 text-slate-800 rounded-tl-none shadow-sm'
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                  </div>
                  {msg.role === 'user' && (
                    <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center shrink-0 mt-1">
                      <User className="w-5 h-5 text-slate-600" />
                    </div>
                  )}
                </div>
              ))}
              {isLoading && (
                <div className="flex gap-3 justify-start">
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                    <Bot className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="px-4 py-3 rounded-2xl bg-white border border-slate-200 rounded-tl-none shadow-sm flex items-center gap-2">
                    <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                    <span className="text-sm text-slate-500">Typing...</span>
                  </div>
                </div>
              )}
              {bookingCompleted && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 mt-4 shadow-sm text-center">
                  <h4 className="font-bold text-green-800 mb-2">Job Card Created Successfully!</h4>
                  <p className="text-xs text-green-700 mb-4">Your Job ID is: {bookingCompleted.id.substring(0, 8)}</p>
                  <button 
                    onClick={sendWhatsAppJobCard}
                    className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg flex justify-center items-center gap-2 transition-colors text-sm"
                  >
                    <MessageSquare className="w-4 h-4" />
                    Get Job Card on WhatsApp
                  </button>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-3 bg-white border-t border-slate-200 shrink-0">
              {uploadedImage && (
                <div className="relative inline-block mb-2">
                  <img src={uploadedImage} alt="Upload preview" className="h-14 w-14 object-cover rounded-lg border border-slate-200 shadow-sm" />
                  <button onClick={() => setUploadedImage(null)} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-sm"><X className="w-3 h-3" /></button>
                </div>
              )}
              <div className="flex items-center gap-2 relative">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                  placeholder="Type a message..."
                  className="flex-1 bg-slate-100 border-transparent focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500 rounded-full pl-4 pr-[6.5rem] py-3 text-sm transition-all"
                  disabled={isLoading || !!bookingCompleted}
                />
                <div className="absolute right-[5.5rem] flex items-center">
                  <label className="p-2 text-slate-500 hover:text-blue-600 cursor-pointer transition-colors" title="Attach Photo">
                    <Camera className="w-5 h-5" />
                    <input 
                      type="file" 
                      accept="image/*"
                      capture="environment"
                      onChange={handleImageUpload}
                      className="hidden"
                      disabled={isLoading || !!bookingCompleted}
                    />
                  </label>
                </div>
                <div className="absolute right-[3.5rem] flex items-center">
                  <VoiceInput 
                    onResult={(text) => setInput(prev => prev ? prev + ' ' + text : text)}
                    isListening={isListening}
                    setIsListening={setIsListening}
                    showText={true}
                  />
                </div>
                <button
                  onClick={handleSend}
                  disabled={(!input.trim() && !uploadedImage) || isLoading || !!bookingCompleted}
                  className="bg-blue-600 text-white p-3 rounded-full hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600 transition-colors shrink-0"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
