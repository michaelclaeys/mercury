/**
 * Simple Auth System for HedgeIQ
 * Add this script to dashboard.html to protect it
 */

// Check if user is logged in
function checkAuth() {
  const user = localStorage.getItem('hedgeiq_user');
  
  if (!user) {
    // Not logged in - redirect to login
    window.location.href = 'login.html';
    return null;
  }

  try {
    const userData = JSON.parse(user);
    
    if (!userData.loggedIn) {
      // Not logged in - redirect to login
      window.location.href = 'login.html';
      return null;
    }

    return userData;
  } catch (e) {
    // Invalid user data - redirect to login
    console.error('Invalid user data:', e);
    window.location.href = 'login.html';
    return null;
  }
}

// Logout function
function logout() {
  localStorage.removeItem('hedgeiq_user');
  window.location.href = 'login.html';
}

// Get current user info
function getCurrentUser() {
  const user = localStorage.getItem('hedgeiq_user');
  if (!user) return null;
  
  try {
    return JSON.parse(user);
  } catch (e) {
    return null;
  }
}

// Run auth check immediately when page loads
const currentUser = checkAuth();

// Export functions for use in other scripts
window.HedgeIQAuth = {
  checkAuth,
  logout,
  getCurrentUser,
  currentUser
};
