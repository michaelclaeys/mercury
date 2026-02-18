/* ================================================================
   MERCURY — Navbar Auth State
   Shows Sign In / Sign Up for visitors, Profile / Logout for users.
   Include after supabase-js + auth.js on any page with .navbar-actions
   ================================================================ */

(function () {
  const actionsEl = document.querySelector('.navbar-actions');
  const mobileMenu = document.getElementById('mobileMenu');
  if (!actionsEl) return;

  async function updateNav() {
    let user = null;
    try {
      if (typeof window.getCurrentUser === 'function') {
        user = await window.getCurrentUser();
      }
    } catch (e) {
      // not logged in
    }

    if (user && user.email) {
      // Logged in — show Profile + Logout
      actionsEl.innerHTML =
        '<a href="architect-app.html" class="btn btn-primary">Launch Architect</a>' +
        '<a href="#" class="btn" onclick="window.signOut && window.signOut()">Logout</a>';
      // Update mobile menu
      if (mobileMenu) {
        const logoutLink = mobileMenu.querySelector('[onclick*="signOut"]');
        if (logoutLink) {
          const appLink = document.createElement('a');
          appLink.href = 'architect-app.html';
          appLink.textContent = 'Launch Architect';
          logoutLink.parentNode.insertBefore(appLink, logoutLink);
        }
      }
    } else {
      // Visitor — show Sign In + Sign Up
      actionsEl.innerHTML =
        '<a href="login.html" class="btn">Sign In</a>' +
        '<a href="signup.html" class="btn btn-primary">Sign Up Free</a>';
      // Update mobile menu
      if (mobileMenu) {
        const logoutLink = mobileMenu.querySelector('[onclick*="signOut"]');
        if (logoutLink) {
          logoutLink.href = 'login.html';
          logoutLink.removeAttribute('onclick');
          logoutLink.textContent = 'Sign In';
          const signupLink = document.createElement('a');
          signupLink.href = 'signup.html';
          signupLink.textContent = 'Sign Up Free';
          logoutLink.parentNode.insertBefore(signupLink, logoutLink.nextSibling);
        }
      }
    }
  }

  // Run after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateNav);
  } else {
    updateNav();
  }
})();
