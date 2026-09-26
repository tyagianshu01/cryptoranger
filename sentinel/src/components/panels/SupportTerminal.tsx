import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, X, Send, Bot, Shield, Loader, Activity } from 'lucide-react';
import axios from 'axios';

interface Message {
    role: 'user' | 'assistant';
    content: string;
}

export function SupportTerminal() {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([
        { role: 'assistant', content: 'INITIALIZING SENTINEL SUPPORT HUB...\n\nConnection established. I am the AI guide for the CryptoTracker Forensics suite. How can I assist you with the Graph Explorer, Cypher Sandbox, or Threat Ledger today?' }
    ]);
    const [inputVal, setInputVal] = useState('');
    const [isTyping, setIsTyping] = useState(false);

    const endRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom of chat
    useEffect(() => {
        if (endRef.current) {
            endRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, isTyping, isOpen]);

    const handleSend = async () => {
        if (!inputVal.trim() || isTyping) return;

        const userMessage: Message = { role: 'user', content: inputVal.trim() };
        setMessages(prev => [...prev, userMessage]);
        setInputVal('');
        setIsTyping(true);

        try {
            const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';
            const response = await axios.post(`${API_URL}/chat/message`, {
                messages: [...messages, userMessage]
            });

            setMessages(prev => [...prev, { role: 'assistant', content: response.data.content }]);
        } catch (err: any) {
            console.error(err);
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: `[SYSTEM ERROR] Comms link failed: ${err.response?.data?.detail || err.message}`
            }]);
        } finally {
            setIsTyping(false);
        }
    };

    return (
        <>
            {/* Floating Action Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    position: 'fixed',
                    bottom: '2rem',
                    right: '2rem',
                    width: '56px',
                    height: '56px',
                    borderRadius: '50%',
                    background: isOpen ? 'var(--color-surface-2)' : 'var(--color-primary)',
                    color: isOpen ? 'var(--color-text)' : '#FFF',
                    border: isOpen ? '1px solid var(--color-border)' : 'none',
                    boxShadow: isOpen ? 'none' : '0 8px 24px rgba(27,43,72,0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    zIndex: 9999,
                    transition: 'all 0.2s ease'
                }}
            >
                {isOpen ? <X size={24} /> : <MessageSquare size={24} />}
                {!isOpen && (
                    <div style={{ position: 'absolute', top: 2, right: 2, width: 10, height: 10, background: '#10B981', borderRadius: '50%', border: '2px solid var(--color-base)' }} />
                )}
            </button>

            {/* Expanded Chat Overlay */}
            {isOpen && (
                <div style={{
                    position: 'fixed',
                    bottom: '100px',
                    right: '2rem',
                    width: '380px',
                    height: '550px',
                    background: 'var(--color-surface-1)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '12px',
                    boxShadow: '0 12px 48px rgba(0,0,0,0.15), 0 4px 16px rgba(0,0,0,0.1)',
                    display: 'flex',
                    flexDirection: 'column',
                    zIndex: 9999,
                    overflow: 'hidden'
                }}>

                    {/* Header */}
                    <div style={{
                        background: 'var(--color-navy)',
                        padding: '1rem 1.25rem',
                        display: 'flex', alignItems: 'center', gap: '0.75rem',
                    }}>
                        <div style={{ background: 'rgba(255,255,255,0.1)', padding: '0.375rem', borderRadius: '6px' }}>
                            <Bot size={18} color="#FFF" />
                        </div>
                        <div>
                            <div style={{ fontFamily: 'var(--font-serif)', fontSize: '14px', fontWeight: 600, color: '#FFF', letterSpacing: '0.5px' }}>
                                SENTINEL AI PROTOCOL
                            </div>
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'rgba(255,255,255,0.6)', letterSpacing: '0.5px' }}>
                                NODE LINK ACTIVE · SECURE CHAN
                            </div>
                        </div>
                    </div>

                    {/* Messages Area */}
                    <div style={{
                        flex: 1,
                        overflowY: 'auto',
                        padding: '1.25rem',
                        display: 'flex', flexDirection: 'column', gap: '1rem',
                        background: 'var(--color-surface-base)'
                    }}>
                        {messages.map((msg, idx) => (
                            <div key={idx} style={{
                                alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                                maxWidth: '85%',
                                display: 'flex', flexDirection: 'column', gap: '0.25rem'
                            }}>
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: '0.375rem',
                                    alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                                    fontFamily: 'var(--font-mono)', fontSize: '9px',
                                    color: 'var(--color-text-faint)', letterSpacing: '0.5px'
                                }}>
                                    {msg.role === 'assistant' ? (
                                        <><Shield size={10} color="var(--color-primary)" /> SYSTEM</>
                                    ) : (
                                        <>OPS <Activity size={10} /></>
                                    )}
                                </div>
                                <div style={{
                                    background: msg.role === 'user' ? 'var(--color-surface-3)' : 'var(--color-lowest)',
                                    color: 'var(--color-text)',
                                    padding: '0.75rem 1rem',
                                    borderRadius: msg.role === 'user' ? '8px 0 8px 8px' : '0 8px 8px 8px',
                                    fontFamily: msg.role === 'user' ? 'var(--font-sans)' : 'var(--font-mono)',
                                    fontSize: '13px',
                                    lineHeight: 1.5,
                                    whiteSpace: 'pre-wrap',
                                    border: msg.role === 'assistant' ? '1px solid var(--color-border)' : 'none'
                                }}>
                                    {msg.content}
                                </div>
                            </div>
                        ))}

                        {isTyping && (
                            <div style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
                                <Loader className="spin" size={14} color="var(--color-primary)" />
                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--color-text-faint)' }}>
                                    AWAITING TELEMETRY...
                                </span>
                            </div>
                        )}
                        <div ref={endRef} />
                    </div>

                    {/* Input Area */}
                    <div style={{
                        padding: '1rem',
                        background: 'var(--color-surface-1)',
                        borderTop: '1px solid var(--color-border)',
                        display: 'flex', gap: '0.5rem'
                    }}>
                        <input
                            type="text"
                            placeholder="Query platform features..."
                            value={inputVal}
                            onChange={e => setInputVal(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleSend(); }}
                            disabled={isTyping}
                            style={{
                                flex: 1,
                                padding: '0.75rem 1rem',
                                borderRadius: '6px',
                                border: '1px solid var(--color-border)',
                                background: 'var(--color-surface-2)',
                                color: 'var(--color-text)',
                                fontFamily: 'var(--font-sans)',
                                fontSize: '13px',
                                outline: 'none'
                            }}
                        />
                        <button
                            onClick={handleSend}
                            disabled={!inputVal.trim() || isTyping}
                            style={{
                                width: '42px', height: '42px',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                background: inputVal.trim() && !isTyping ? 'var(--color-primary)' : 'var(--color-surface-3)',
                                color: '#FFF',
                                border: 'none', borderRadius: '6px',
                                cursor: inputVal.trim() && !isTyping ? 'pointer' : 'not-allowed',
                                transition: 'background 0.2s ease'
                            }}
                        >
                            <Send size={16} />
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}
