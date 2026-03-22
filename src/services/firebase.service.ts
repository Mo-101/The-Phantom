/**
 * Firebase Service Layer for Phantom POE Engine
 * 
 * Integrates Firebase Firestore as the persistence layer for:
 * - User profiles and sessions
 * - Chat history with Gemini AI
 * - Corridor detection events
 * - Real-time collaboration and audit logs
 * 
 * This service bridges the Firebase chat system from the provided files
 * with the Neon/Supabase backend for corridor intelligence.
 */

import {
  auth,
  db,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  limit,
  Timestamp,
  serverTimestamp,
  type FirebaseUser,
  handleFirestoreError,
  OperationType,
} from '@/lib/firebase';

// ============================================================================
// Type Definitions
// ============================================================================

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string | null;
  role: 'admin' | 'client';
  createdAt: Timestamp;
  lastActiveAt: Timestamp;
  metadata?: {
    organization?: string;
    region?: string;
    accessLevel?: string;
  };
}

export interface ChatTurn {
  id?: string;
  uid: string;
  role: 'user' | 'model' | 'error';
  message: string;
  timestamp: Timestamp;
  isThinking?: boolean;
  metadata?: {
    corridorId?: string;
    signalCount?: number;
    toolCalls?: string[];
    modelUsed?: string;
  };
}

export interface CorridorDetectionEvent {
  id?: string;
  corridorId: string;
  routeName: string;
  eventType: 'TRINITY_SYNTHESIS_COMPLETED' | 'SIGNAL_INGESTED' | 'CORRIDOR_ACTIVATED' | 'THRESHOLD_BREACH';
  score: number;
  summary: string;
  severity: 'info' | 'warning' | 'critical';
  sourceCount: number;
  detectedBy?: string;
  timestamp: Timestamp;
  metadata?: {
    lat?: number;
    lng?: number;
    runId?: string;
    inferredMode?: string;
  };
}

export interface CollaborationSession {
  id?: string;
  corridorId: string;
  userId: string;
  userName: string;
  action: 'viewing' | 'analyzing' | 'annotating';
  timestamp: Timestamp;
  metadata?: {
    zoomLevel?: number;
    selectedNodes?: string[];
  };
}

// ============================================================================
// User Profile Management
// ============================================================================

export class FirebaseUserService {
  /**
   * Create or update a user profile in Firestore
   */
  static async createOrUpdateProfile(firebaseUser: FirebaseUser, role: 'admin' | 'client' = 'client'): Promise<UserProfile> {
    try {
      const userRef = doc(db, 'users', firebaseUser.uid);
      
      const profile: UserProfile = {
        uid: firebaseUser.uid,
        displayName: firebaseUser.displayName || 'Anonymous',
        email: firebaseUser.email || '',
        photoURL: firebaseUser.photoURL,
        role,
        createdAt: Timestamp.now(),
        lastActiveAt: Timestamp.now(),
      };

      await setDoc(userRef, profile, { merge: true });
      return profile;
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `/users/${firebaseUser.uid}`);
    }
  }

  /**
   * Get a user profile by UID
   */
  static async getProfile(uid: string): Promise<UserProfile | null> {
    try {
      const userRef = doc(db, 'users', uid);
      const snapshot = await getDoc(userRef);
      
      if (!snapshot.exists()) return null;
      return snapshot.data() as UserProfile;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `/users/${uid}`);
    }
  }

  /**
   * Update last active timestamp
   */
  static async updateLastActive(uid: string): Promise<void> {
    try {
      const userRef = doc(db, 'users', uid);
      await setDoc(userRef, { lastActiveAt: serverTimestamp() }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `/users/${uid}`);
    }
  }

  /**
   * Get current authenticated user
   */
  static getCurrentUser(): FirebaseUser | null {
    return auth.currentUser;
  }

  /**
   * Listen to auth state changes
   */
  static onAuthChange(callback: (user: FirebaseUser | null) => void): () => void {
    const { onAuthStateChanged } = require('@/lib/firebase');
    return onAuthStateChanged(auth, callback);
  }
}

// ============================================================================
// Chat History Service
// ============================================================================

export class ChatHistoryService {
  /**
   * Save a chat turn to Firestore
   */
  static async saveChatTurn(
    uid: string,
    role: 'user' | 'model' | 'error',
    message: string,
    isThinking: boolean = false,
    metadata?: ChatTurn['metadata']
  ): Promise<string> {
    try {
      const chatRef = collection(db, 'users', uid, 'chatHistory');
      
      const turn: Omit<ChatTurn, 'id'> = {
        uid,
        role,
        message,
        timestamp: serverTimestamp() as Timestamp,
        isThinking,
        metadata,
      };

      const docRef = await addDoc(chatRef, turn);
      return docRef.id;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `/users/${uid}/chatHistory`);
    }
  }

  /**
   * Get chat history for a user (latest N messages)
   */
  static async getChatHistory(uid: string, limitCount: number = 50): Promise<ChatTurn[]> {
    try {
      const chatRef = collection(db, 'users', uid, 'chatHistory');
      const q = query(chatRef, orderBy('timestamp', 'desc'), limit(limitCount));
      const snapshot = await getDocs(q);
      
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as ChatTurn[];
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, `/users/${uid}/chatHistory`);
    }
  }

  /**
   * Listen to real-time chat updates
   */
  static listenToChatHistory(
    uid: string,
    limitCount: number = 50,
    callback: (turns: ChatTurn[]) => void
  ): () => void {
    const chatRef = collection(db, 'users', uid, 'chatHistory');
    const q = query(chatRef, orderBy('timestamp', 'desc'), limit(limitCount));
    
    return onSnapshot(q, (snapshot) => {
      const turns = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as ChatTurn[];
      callback(turns.reverse());
    });
  }
}

// ============================================================================
// Corridor Detection Events Service
// ============================================================================

export class CorridorEventsService {
  /**
   * Log a corridor detection event
   */
  static async logDetectionEvent(event: Omit<CorridorDetectionEvent, 'id' | 'timestamp'>): Promise<string> {
    try {
      const eventsRef = collection(db, 'corridorDetections');
      
      const eventDoc: Omit<CorridorDetectionEvent, 'id'> = {
        ...event,
        timestamp: serverTimestamp() as Timestamp,
      };

      const docRef = await addDoc(eventsRef, eventDoc);
      
      // Also write to Neon database via API for dual persistence
      try {
        await fetch('/api/detections', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event_type: event.eventType,
            corridor_id: event.corridorId,
            route_name: event.routeName,
            score: event.score,
            summary: event.summary,
            severity: event.severity,
            source_count: event.sourceCount,
          }),
        });
      } catch (neonError) {
        console.warn('[v0] Neon detection write failed, continuing with Firebase only:', neonError);
      }
      
      return docRef.id;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, '/corridorDetections');
    }
  }

  /**
   * Get recent detection events for a specific corridor
   */
  static async getCorridorEvents(corridorId: string, limitCount: number = 20): Promise<CorridorDetectionEvent[]> {
    try {
      const eventsRef = collection(db, 'corridorDetections');
      const q = query(eventsRef, orderBy('timestamp', 'desc'), limit(limitCount));
      const snapshot = await getDocs(q);
      
      return snapshot.docs
        .filter(doc => doc.data().corridorId === corridorId)
        .map(doc => ({
          id: doc.id,
          ...doc.data(),
        })) as CorridorDetectionEvent[];
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, '/corridorDetections');
    }
  }

  /**
   * Get all recent detection events (for dashboard)
   */
  static async getAllRecentEvents(limitCount: number = 100): Promise<CorridorDetectionEvent[]> {
    try {
      const eventsRef = collection(db, 'corridorDetections');
      const q = query(eventsRef, orderBy('timestamp', 'desc'), limit(limitCount));
      const snapshot = await getDocs(q);
      
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as CorridorDetectionEvent[];
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, '/corridorDetections');
    }
  }

  /**
   * Listen to real-time detection events
   */
  static listenToDetectionEvents(
    limitCount: number = 50,
    callback: (events: CorridorDetectionEvent[]) => void
  ): () => void {
    const eventsRef = collection(db, 'corridorDetections');
    const q = query(eventsRef, orderBy('timestamp', 'desc'), limit(limitCount));
    
    return onSnapshot(q, (snapshot) => {
      const events = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as CorridorDetectionEvent[];
      callback(events);
    });
  }
}

// ============================================================================
// Real-time Collaboration Service
// ============================================================================

export class CollaborationService {
  /**
   * Log a user's current activity on a corridor
   */
  static async logActivity(session: Omit<CollaborationSession, 'id' | 'timestamp'>): Promise<string> {
    try {
      const sessionsRef = collection(db, 'collaborationSessions');
      
      const sessionDoc: Omit<CollaborationSession, 'id'> = {
        ...session,
        timestamp: serverTimestamp() as Timestamp,
      };

      const docRef = await setDoc(
        doc(sessionsRef, `${session.corridorId}_${session.userId}`),
        sessionDoc
      );
      
      return `${session.corridorId}_${session.userId}`;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, '/collaborationSessions');
    }
  }

  /**
   * Get active users viewing a specific corridor
   */
  static listenToCorridorViewers(
    corridorId: string,
    callback: (sessions: CollaborationSession[]) => void
  ): () => void {
    const sessionsRef = collection(db, 'collaborationSessions');
    const q = query(sessionsRef, orderBy('timestamp', 'desc'), limit(50));
    
    return onSnapshot(q, (snapshot) => {
      const now = Date.now();
      const fiveMinutesAgo = now - 5 * 60 * 1000;
      
      const sessions = snapshot.docs
        .map(doc => ({
          id: doc.id,
          ...doc.data(),
        })) as CollaborationSession[];
      
      // Filter for this corridor and only sessions active in last 5 minutes
      const activeSessions = sessions.filter(
        s => s.corridorId === corridorId && s.timestamp.toMillis() > fiveMinutesAgo
      );
      
      callback(activeSessions);
    });
  }
}

// ============================================================================
// Hybrid Neon + Firebase Query Service
// ============================================================================

export class HybridQueryService {
  /**
   * Fetch corridor data from Neon (primary) with Firebase event enrichment
   */
  static async getEnrichedCorridor(corridorId: string): Promise<any> {
    try {
      // 1. Get corridor definition from Neon
      const corridorRes = await fetch(`/api/corridors/live?id=${corridorId}`);
      if (!corridorRes.ok) throw new Error('Corridor not found in Neon');
      const corridorData = await corridorRes.json();
      
      // 2. Enrich with Firebase detection events
      const events = await CorridorEventsService.getCorridorEvents(corridorId, 10);
      
      return {
        ...corridorData,
        recentEvents: events,
        lastDetection: events[0] || null,
        eventCount: events.length,
      };
    } catch (error) {
      console.error('[v0] Hybrid query failed:', error);
      throw error;
    }
  }

  /**
   * Write corridor analysis result to both Neon and Firebase
   */
  static async recordAnalysis(params: {
    corridorId: string;
    routeName: string;
    score: number;
    riskClass: string;
    sourceCount: number;
    userId?: string;
  }): Promise<void> {
    const { corridorId, routeName, score, riskClass, sourceCount, userId } = params;
    
    // Firebase detection event
    await CorridorEventsService.logDetectionEvent({
      corridorId,
      routeName,
      eventType: 'TRINITY_SYNTHESIS_COMPLETED',
      score,
      summary: `Analysis complete: ${score.toFixed(4)} (${riskClass})`,
      severity: score >= 0.85 ? 'critical' : 'warning',
      sourceCount,
      detectedBy: userId,
    });
    
    // If user is authenticated, also log to chat history
    if (userId) {
      await ChatHistoryService.saveChatTurn(
        userId,
        'model',
        `Corridor analysis completed: ${corridorId}\nScore: ${score.toFixed(4)}\nRisk: ${riskClass}\nSignals: ${sourceCount}`,
        false,
        {
          corridorId,
          signalCount: sourceCount,
          toolCalls: ['analyze_corridor'],
        }
      );
    }
  }
}

// ============================================================================
// Exports
// ============================================================================

export const FirebaseServices = {
  User: FirebaseUserService,
  Chat: ChatHistoryService,
  Events: CorridorEventsService,
  Collaboration: CollaborationService,
  Hybrid: HybridQueryService,
};

export default FirebaseServices;
