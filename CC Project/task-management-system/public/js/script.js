// Client-side JavaScript for enhanced user experience
document.addEventListener('DOMContentLoaded', function() {
    // Form validation enhancement
    const forms = document.querySelectorAll('form');
    forms.forEach(form => {
        form.addEventListener('submit', function(e) {
            const submitBtn = this.querySelector('button[type="submit"]');
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = 'Processing...';
            }
        });
    });

    // Auto-hide alerts after 5 seconds
    const alerts = document.querySelectorAll('.alert');
    alerts.forEach(alert => {
        setTimeout(() => {
            alert.style.opacity = '0';
            alert.style.transition = 'opacity 0.5s';
            setTimeout(() => alert.remove(), 500);
        }, 5000);
    });

    // Password strength indicator (for register page)
    const passwordInput = document.getElementById('password');
    if (passwordInput) {
        passwordInput.addEventListener('input', function() {
            const strengthIndicator = document.getElementById('password-strength') || createStrengthIndicator();
            const strength = calculatePasswordStrength(this.value);
            updateStrengthIndicator(strengthIndicator, strength);
        });
    }
});

function createStrengthIndicator() {
    const indicator = document.createElement('div');
    indicator.id = 'password-strength';
    indicator.className = 'password-strength';
    passwordInput.parentNode.appendChild(indicator);
    return indicator;
}

function calculatePasswordStrength(password) {
    let strength = 0;
    if (password.length >= 6) strength += 1;
    if (password.match(/[a-z]/) && password.match(/[A-Z]/)) strength += 1;
    if (password.match(/\d/)) strength += 1;
    if (password.match(/[^a-zA-Z\d]/)) strength += 1;
    return strength;
}

function updateStrengthIndicator(indicator, strength) {
    const texts = ['Very Weak', 'Weak', 'Fair', 'Good', 'Strong'];
    const colors = ['#dc3545', '#ffc107', '#ffc107', '#17a2b8', '#28a745'];
    
    indicator.textContent = `Password Strength: ${texts[strength]}`;
    indicator.style.color = colors[strength];
}