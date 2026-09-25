import React, { useState, useEffect, useMemo } from 'react';
import { db, auth } from '../firebase';
import { collection, onSnapshot, doc, setDoc, deleteDoc, query, orderBy } from 'firebase/firestore';
import { AppUser, UserRole } from '../types';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { 
  Plus, Trash2, Edit2, X, UserPlus, Mail, Shield, User, Lock, 
  AlertCircle, Check, Key, Eye, EyeOff, Send, CheckCircle2, RefreshCw 
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  createUserWithEmailAndPassword, 
  updatePassword, 
  sendPasswordResetEmail, 
  signInWithEmailAndPassword 
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

// Secondary app for creating users without logging out the admin
const secondaryApp = initializeApp(firebaseConfig, 'Secondary');
const secondaryAuth = getAuth(secondaryApp);

export default function AdminPanel({ userRole }: { userRole: UserRole | null }) {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirmUid, setDeleteConfirmUid] = useState<string | null>(null);
  const [ownAccountError, setOwnAccountError] = useState<string | null>(null);
  
  // Password management states
  const [showPassword, setShowPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [isSendingResetEmail, setIsSendingResetEmail] = useState(false);
  const [resetNotification, setResetNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [tableResetSuccessUid, setTableResetSuccessUid] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    password: '',
    role: 'viewer' as UserRole
  });

  useEffect(() => {
    if (userRole !== 'admin') return;
    const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snapshot) => {
      setUsers(snapshot.docs.map(doc => doc.data() as AppUser));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'users'));
  }, [userRole]);

  if (userRole !== 'admin') {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
        <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-4 text-rose-600">
          <Shield size={32} />
        </div>
        <h3 className="text-lg font-bold text-slate-900 mb-2">Access Denied</h3>
        <p className="text-slate-500">You do not have permission to access the Admin Panel.</p>
      </div>
    );
  }

  const handleSendResetEmail = async (email: string, userUid?: string) => {
    setIsSendingResetEmail(true);
    setResetNotification(null);
    setError(null);
    try {
      await sendPasswordResetEmail(auth, email);
      const msg = `Password reset email successfully sent to ${email}. The user will receive instructions to reset their password.`;
      setResetNotification({ type: 'success', message: msg });
      if (userUid) {
        setTableResetSuccessUid(userUid);
        setTimeout(() => setTableResetSuccessUid(null), 4000);
      }
    } catch (err: any) {
      console.error('Password reset email error:', err);
      const msg = err.code === 'auth/user-not-found'
        ? `No account found with email ${email}.`
        : (err.message || 'Failed to send password reset email.');
      setResetNotification({ type: 'error', message: msg });
    } finally {
      setIsSendingResetEmail(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (editingUser) {
        let passwordResetNote = '';

        // Handle password update/reset if provided
        if (formData.password.trim()) {
          if (formData.password.length < 6) {
            setError('Password must be at least 6 characters long.');
            setLoading(false);
            return;
          }

          // Case 1: Editing own admin account
          if (editingUser.uid === auth.currentUser?.uid) {
            try {
              await updatePassword(auth.currentUser, formData.password.trim());
              passwordResetNote = ' Your password has been updated.';
            } catch (pErr: any) {
              console.error('Failed to update own password:', pErr);
              if (pErr.code === 'auth/requires-recent-login') {
                setError('For security, changing your own password requires a recent login. Please log out, sign back in, and try again, or use the reset email option.');
                setLoading(false);
                return;
              }
              throw pErr;
            }
          }
          // Case 2: Editing another user and current password was provided
          else if (currentPassword.trim()) {
            try {
              const tempCred = await signInWithEmailAndPassword(
                secondaryAuth,
                editingUser.email,
                currentPassword.trim()
              );
              await updatePassword(tempCred.user, formData.password.trim());
              await secondaryAuth.signOut();
              passwordResetNote = ` Password for ${editingUser.fullName} was successfully updated.`;
            } catch (pErr: any) {
              console.error('Failed to update password with current password:', pErr);
              setError('Current password is incorrect. Please check the current password, or click "Send Password Reset Email" to send a reset link instead.');
              setLoading(false);
              return;
            }
          }
          // Case 3: Editing another user without current password
          else {
            try {
              await sendPasswordResetEmail(auth, editingUser.email);
              passwordResetNote = ` A password reset link has been dispatched to ${editingUser.email}.`;
            } catch (pErr: any) {
              console.error('Failed to send reset email during save:', pErr);
              // Non-blocking for profile update, but inform user
              passwordResetNote = ` (Note: Could not auto-send reset email: ${pErr.message})`;
            }
          }
        }

        // Update existing user details in Firestore
        await setDoc(doc(db, 'users', editingUser.uid), {
          ...editingUser,
          fullName: formData.fullName,
          role: formData.role
        });

        if (passwordResetNote) {
          setResetNotification({
            type: 'success',
            message: `User details saved successfully.${passwordResetNote}`
          });
        }
      } else {
        // Create new user in Firebase Auth
        if (formData.password.length < 6) {
          setError('Password must be at least 6 characters long.');
          setLoading(false);
          return;
        }

        const userCredential = await createUserWithEmailAndPassword(
          secondaryAuth,
          formData.email,
          formData.password
        );
        
        const newUser: AppUser = {
          uid: userCredential.user.uid,
          fullName: formData.fullName,
          email: formData.email,
          role: formData.role,
          createdAt: new Date().toISOString()
        };

        // Store user metadata in Firestore
        await setDoc(doc(db, 'users', newUser.uid), newUser);
        
        // Sign out from secondary auth to avoid session issues
        await secondaryAuth.signOut();

        setResetNotification({
          type: 'success',
          message: `Team member ${newUser.fullName} (${newUser.email}) added successfully.`
        });
      }

      setIsAdding(false);
      setEditingUser(null);
      setFormData({ fullName: '', email: '', password: '', role: 'viewer' });
      setCurrentPassword('');
      setShowPassword(false);
    } catch (err: any) {
      console.error('Admin action error:', err);
      setError(err.message || 'An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (uid: string) => {
    if (uid === auth.currentUser?.uid) {
      setOwnAccountError("You cannot delete your own admin account.");
      setTimeout(() => setOwnAccountError(null), 4000);
      return;
    }
    
    try {
      await deleteDoc(doc(db, 'users', uid));
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-slate-800">Team Management</h3>
          <p className="text-sm text-slate-500">Add and manage team members, roles, and access passwords.</p>
        </div>
        <button
          onClick={() => {
            setIsAdding(true);
            setEditingUser(null);
            setFormData({ fullName: '', email: '', password: '', role: 'viewer' });
            setCurrentPassword('');
            setShowPassword(false);
            setError(null);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-all shadow-md font-semibold cursor-pointer"
        >
          <UserPlus size={18} />
          Add Team Member
        </button>
      </div>

      {resetNotification && (
        <div className={`p-4 rounded-2xl flex items-center justify-between gap-3 text-sm font-semibold animate-in fade-in slide-in-from-top-2 ${
          resetNotification.type === 'success'
            ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
            : 'bg-rose-50 border border-rose-200 text-rose-800'
        }`}>
          <div className="flex items-center gap-2.5">
            {resetNotification.type === 'success' ? (
              <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle size={18} className="text-rose-600 shrink-0" />
            )}
            <span>{resetNotification.message}</span>
          </div>
          <button 
            type="button" 
            onClick={() => setResetNotification(null)} 
            className="p-1 hover:bg-black/5 rounded-lg transition-colors cursor-pointer text-slate-400 hover:text-slate-600"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {ownAccountError && (
        <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-center gap-2 text-rose-600 text-sm font-semibold animate-in fade-in slide-in-from-top-2">
          <AlertCircle size={18} className="shrink-0" />
          {ownAccountError}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Full Name</th>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Email / User ID</th>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Role</th>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((user) => (
                <tr key={user.uid} className="hover:bg-slate-50/50 transition-colors">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 font-bold text-xs">
                        {user.fullName.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-sm font-semibold text-slate-900">{user.fullName}</span>
                    </div>
                  </td>
                  <td className="p-4 text-sm text-slate-600">{user.email}</td>
                  <td className="p-4 text-center">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                      user.role === 'admin' ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {user.role.toUpperCase()}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => handleSendResetEmail(user.email, user.uid)}
                        disabled={isSendingResetEmail}
                        className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-all"
                        title="Send Password Reset Email"
                      >
                        {tableResetSuccessUid === user.uid ? (
                          <CheckCircle2 size={16} className="text-emerald-600" />
                        ) : (
                          <Key size={16} />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingUser(user);
                          setFormData({ fullName: user.fullName, email: user.email, password: '', role: user.role });
                          setCurrentPassword('');
                          setShowPassword(false);
                          setError(null);
                          setIsAdding(true);
                        }}
                        className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                        title="Edit Team Member"
                      >
                        <Edit2 size={16} />
                      </button>
                      {deleteConfirmUid === user.uid ? (
                        <div className="flex items-center gap-1 bg-rose-50 p-0.5 rounded-lg border border-rose-100">
                          <span className="text-[10px] font-bold text-rose-600 px-1">Delete?</span>
                          <button
                            onClick={async () => {
                              await handleDelete(user.uid);
                              setDeleteConfirmUid(null);
                            }}
                            className="p-1 text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                            title="Confirm Delete"
                          >
                            <Check size={12} />
                          </button>
                          <button
                            onClick={() => setDeleteConfirmUid(null)}
                            className="p-1 text-slate-400 hover:bg-slate-100 rounded transition-colors"
                            title="Cancel"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirmUid(user.uid)}
                          className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                          title="Delete User"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-slate-400 italic text-sm">
                    No team members found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isAdding && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[1000] overflow-y-auto flex justify-center p-4 py-8 md:py-12">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md my-auto relative">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900">
                {editingUser ? 'Edit Team Member' : 'Add Team Member'}
              </h2>
              <button onClick={() => setIsAdding(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-8 space-y-6">
              {error && (
                <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl flex items-center gap-2 text-rose-600 text-sm font-semibold">
                  <AlertCircle size={16} className="shrink-0" />
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Full Name</label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input
                    type="text"
                    required
                    value={formData.fullName}
                    onChange={(e) => setFormData(prev => ({ ...prev, fullName: e.target.value }))}
                    placeholder="John Doe"
                    className="w-full pl-12 pr-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Email Address (User ID)</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input
                    type="email"
                    required
                    disabled={!!editingUser}
                    value={formData.email}
                    onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                    placeholder="john@company.com"
                    className="w-full pl-12 pr-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all disabled:bg-slate-50 disabled:text-slate-400"
                  />
                </div>
              </div>

              {editingUser ? (
                <div className="space-y-3.5 p-4 rounded-2xl bg-slate-50 border border-slate-200">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                      <Key size={14} className="text-indigo-600" />
                      <span>Password & Reset Options</span>
                    </label>
                  </div>

                  {/* 1-Click Send Password Reset Email */}
                  <div className="p-3 bg-white rounded-xl border border-slate-200/80 shadow-xs space-y-1.5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                          <Mail size={13} className="text-indigo-600" />
                          <span>Send Password Reset Link</span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                          Sends an official Firebase reset link to <strong className="text-slate-700">{formData.email}</strong>.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleSendResetEmail(formData.email)}
                        disabled={isSendingResetEmail}
                        className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold transition-all disabled:opacity-50 shrink-0 flex items-center gap-1.5 cursor-pointer"
                      >
                        {isSendingResetEmail ? (
                          <>
                            <RefreshCw size={12} className="animate-spin" />
                            <span>Sending...</span>
                          </>
                        ) : (
                          <>
                            <Send size={12} />
                            <span>Send Email</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Direct New Password Input */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-slate-700">
                        Set New Password (Optional)
                      </label>
                      <span className="text-[10px] text-slate-400 font-medium">Leave blank to keep unchanged</span>
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                      <input
                        type={showPassword ? "text" : "password"}
                        value={formData.password}
                        onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                        placeholder="Enter new password (min. 6 characters)"
                        minLength={6}
                        className="w-full pl-10 pr-10 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all bg-white text-xs font-medium"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                        tabIndex={-1}
                      >
                        {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      {editingUser.uid === auth.currentUser?.uid
                        ? "Enter a new password (min. 6 characters) to update your admin credentials."
                        : "Enter a new password (min. 6 characters) to reset this user's password directly."}
                    </p>
                  </div>

                  {/* If editing another user and password is typed, optional current password */}
                  {editingUser.uid !== auth.currentUser?.uid && formData.password.trim().length > 0 && (
                    <div className="space-y-1.5 pt-2 border-t border-slate-200 animate-in fade-in">
                      <label className="text-xs font-semibold text-slate-700 block">
                        Current / Temporary Password (if known)
                      </label>
                      <input
                        type="password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        placeholder="User's current password (optional)"
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all bg-white text-xs font-medium"
                      />
                      <p className="text-[11px] text-slate-500">
                        If current password is unknown, saving will automatically dispatch a secure password reset link to their email address.
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      minLength={6}
                      value={formData.password}
                      onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                      placeholder="•••••••• (min. 6 characters)"
                      className="w-full pl-12 pr-11 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 rounded-md cursor-pointer"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Role</label>
                <div className="relative">
                  <Shield className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData(prev => ({ ...prev, role: e.target.value as UserRole }))}
                    className="w-full pl-12 pr-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all bg-white"
                  >
                    <option value="admin">Admin (Full Access)</option>
                    <option value="viewer">Viewer (Read-Only)</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="flex-1 px-6 py-2.5 text-slate-600 font-semibold hover:bg-slate-50 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-8 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-200 transition-all disabled:opacity-50"
                >
                  {loading ? 'Saving...' : 'Save Member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
