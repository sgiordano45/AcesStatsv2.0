// js/data/team-staff.js
// Team-staff requests: request, approve, remove, deny, list requests and members.
// Moved unchanged from firebase-auth.js (only the imports changed and the info
// console.log lines were dropped); firebase-auth.js re-exports these.

import { db, doc, getDoc, getDocs, collection, updateDoc, serverTimestamp } from '../core/firebase.js';
import { USER_ROLES } from '../core/auth.js';

/**
 * Request team-staff access for a team
 */
export async function requestTeamStaffAccess(userId, teamId, teamName) {
  try {
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      return { success: false, message: 'User not found' };
    }
    
    const currentRequests = userDoc.data().staffRequests || [];
    
    // Check if already requested
    const existingRequest = currentRequests.find(
      r => r.teamId === teamId && r.status === 'pending'
    );
    
    if (existingRequest) {
      return { success: false, message: 'Request already pending' };
    }
    
    // Check if already staff for this team
    const teamRoles = userDoc.data().teamRoles || {};
    if (teamRoles[teamId] && teamRoles[teamId].status === 'active') {
      return { success: false, message: 'Already staff member of this team' };
    }
    
    // Add new request
    currentRequests.push({
      teamId,
      teamName,
      requestedAt: serverTimestamp(),
      status: 'pending',
      requestedBy: userId
    });
    
    await updateDoc(userRef, {
      staffRequests: currentRequests,
      updatedAt: serverTimestamp()
    });
    
    return { success: true, message: 'Request submitted to team captain' };
    
  } catch (error) {
    console.error('❌ Error requesting staff access:', error);
    return { success: false, error: error.code };
  }
}

/**
 * Approve team-staff request (captain only)
 */
export async function approveTeamStaff(captainId, requestUserId, teamId) {
  try {
    // Verify captain has permission
    const captainDoc = await getDoc(doc(db, 'users', captainId));
    if (!captainDoc.exists()) {
      return { success: false, message: 'Captain not found' };
    }
    
    const captainData = captainDoc.data();
    const captainTeamRole = captainData.teamRoles?.[teamId];
    
    if (!captainTeamRole || captainTeamRole.role !== USER_ROLES.CAPTAIN) {
      return { success: false, message: 'Only team captain can approve staff' };
    }
    
    // Update the requesting user's profile
    const userRef = doc(db, 'users', requestUserId);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      return { success: false, message: 'User not found' };
    }
    
    const userData = userDoc.data();
    const staffRequests = userData.staffRequests || [];
    
    // Update request status
    const updatedRequests = staffRequests.map(req => {
      if (req.teamId === teamId && req.status === 'pending') {
        return {
          ...req,
          status: 'approved',
          reviewedBy: captainId,
          reviewedAt: new Date().toISOString()
        };
      }
      return req;
    });
    
    // Add team-staff role
    const teamRoles = userData.teamRoles || {};
    teamRoles[teamId] = {
      role: USER_ROLES.TEAM_STAFF,
      approvedBy: captainId,
      approvedAt: serverTimestamp(),
      canBeRemovedBy: [captainId],
      status: 'active'
    };
    
    await updateDoc(userRef, {
      userRole: USER_ROLES.TEAM_STAFF,
      linkedTeam: teamId,
      teamRoles,
      staffRequests: updatedRequests,
      updatedAt: serverTimestamp()
    });
    
    return { success: true, message: 'Staff member approved' };
    
  } catch (error) {
    console.error('❌ Error approving staff:', error);
    return { success: false, error: error.code };
  }
}

/**
 * Remove team-staff member (captain only, cannot remove captain)
 */
export async function removeTeamStaff(captainId, staffUserId, teamId) {
  try {
    // Verify captain has permission
    const captainDoc = await getDoc(doc(db, 'users', captainId));
    const staffDoc = await getDoc(doc(db, 'users', staffUserId));
    
    if (!captainDoc.exists() || !staffDoc.exists()) {
      return { success: false, message: 'User not found' };
    }
    
    const captainData = captainDoc.data();
    const staffData = staffDoc.data();
    
    // Check captain permission
    const captainTeamRole = captainData.teamRoles?.[teamId];
    if (!captainTeamRole || captainTeamRole.role !== USER_ROLES.CAPTAIN) {
      return { success: false, message: 'Only team captain can remove staff' };
    }
    
    // Check if trying to remove captain (not allowed)
    const staffTeamRole = staffData.teamRoles?.[teamId];
    if (staffTeamRole?.role === USER_ROLES.CAPTAIN) {
      return { success: false, message: 'Cannot remove team captain. Only league staff/admin can remove captains.' };
    }
    
    // Remove team-staff role
    const teamRoles = staffData.teamRoles || {};
    if (teamRoles[teamId]) {
      teamRoles[teamId].status = 'removed';
      teamRoles[teamId].removedBy = captainId;
      teamRoles[teamId].removedAt = serverTimestamp();
    }
    
    // Determine new user role
    const activeRoles = Object.values(teamRoles).filter(r => r.status === 'active');
    let newUserRole = USER_ROLES.PLAYER;
    
    if (activeRoles.length > 0) {
      // User has other active team roles
      newUserRole = activeRoles[0].role;
    }
    
    await updateDoc(doc(db, 'users', staffUserId), {
      userRole: newUserRole,
      linkedTeam: activeRoles.length > 0 ? Object.keys(teamRoles).find(tid => teamRoles[tid].status === 'active') : null,
      teamRoles,
      updatedAt: serverTimestamp()
    });
    
    return { success: true, message: 'Staff member removed' };
    
  } catch (error) {
    console.error('❌ Error removing staff:', error);
    return { success: false, error: error.code };
  }
}

/**
 * Deny team-staff request (captain only)
 */
export async function denyTeamStaffRequest(captainId, requestUserId, teamId) {
  try {
    const captainDoc = await getDoc(doc(db, 'users', captainId));
    if (!captainDoc.exists()) {
      return { success: false, message: 'Captain not found' };
    }
    
    const captainData = captainDoc.data();
    const captainTeamRole = captainData.teamRoles?.[teamId];
    
    if (!captainTeamRole || captainTeamRole.role !== USER_ROLES.CAPTAIN) {
      return { success: false, message: 'Only team captain can deny requests' };
    }
    
    const userRef = doc(db, 'users', requestUserId);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      return { success: false, message: 'User not found' };
    }
    
    const userData = userDoc.data();
    const staffRequests = userData.staffRequests || [];
    
    const updatedRequests = staffRequests.map(req => {
      if (req.teamId === teamId && req.status === 'pending') {
        return {
          ...req,
          status: 'denied',
          reviewedBy: captainId,
          reviewedAt: new Date().toISOString()
        };
      }
      return req;
    });
    
    await updateDoc(userRef, {
      staffRequests: updatedRequests,
      updatedAt: serverTimestamp()
    });
    
    return { success: true, message: 'Request denied' };
    
  } catch (error) {
    console.error('❌ Error denying request:', error);
    return { success: false, error: error.code };
  }
}

/**
 * Get all pending staff requests for a team (captain view)
 */
export async function getTeamStaffRequests(teamId) {
  try {
    const usersSnapshot = await getDocs(collection(db, 'users'));
    const pendingRequests = [];
    
    usersSnapshot.forEach(docSnap => {
      const userData = docSnap.data();
      const requests = userData.staffRequests || [];
      
      requests.forEach(req => {
        if (req.teamId === teamId && req.status === 'pending') {
          pendingRequests.push({
            userId: docSnap.id,
            userName: userData.displayName,
            userEmail: userData.email,
            photoURL: userData.photoURL || null,
            ...req
          });
        }
      });
    });
    
    return { success: true, requests: pendingRequests };
    
  } catch (error) {
    console.error('❌ Error fetching staff requests:', error);
    return { success: false, error: error.code, requests: [] };
  }
}

/**
 * Get all team-staff members for a team
 */
export async function getTeamStaffMembers(teamId) {
  try {
    const usersSnapshot = await getDocs(collection(db, 'users'));
    const staffMembers = [];
    
    usersSnapshot.forEach(docSnap => {
      const userData = docSnap.data();
      const teamRole = userData.teamRoles?.[teamId];
      
      if (teamRole && 
          (teamRole.role === USER_ROLES.TEAM_STAFF || teamRole.role === USER_ROLES.CAPTAIN) &&
          teamRole.status === 'active') {
        staffMembers.push({
          userId: docSnap.id,
          userName: userData.displayName,
          userEmail: userData.email,
          photoURL: userData.photoURL || null,
          role: teamRole.role,
          approvedBy: teamRole.approvedBy,
          approvedAt: teamRole.approvedAt
        });
      }
    });
    
    // Sort: captains first, then team-staff
    staffMembers.sort((a, b) => {
      if (a.role === USER_ROLES.CAPTAIN && b.role !== USER_ROLES.CAPTAIN) return -1;
      if (a.role !== USER_ROLES.CAPTAIN && b.role === USER_ROLES.CAPTAIN) return 1;
      return a.userName.localeCompare(b.userName);
    });
    
    return { success: true, staff: staffMembers };
    
  } catch (error) {
    console.error('❌ Error fetching staff members:', error);
    return { success: false, error: error.code, staff: [] };
  }
}
