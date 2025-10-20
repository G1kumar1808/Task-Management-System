// Password strength indicator functionality
document.addEventListener('DOMContentLoaded', function() {
    // Initialize password strength indicator only on pages with password fields
    const passwordInput = document.getElementById('password');
    const registerPasswordInput = document.getElementById('register-password');
    
    if (passwordInput) {
        createStrengthIndicator(passwordInput);
    }
    
    if (registerPasswordInput) {
        createStrengthIndicator(registerPasswordInput);
    }
});

function createStrengthIndicator(inputElement) {
    const strengthBar = document.createElement('div');
    strengthBar.className = 'password-strength';
    strengthBar.innerHTML = `
        <div class="strength-bar">
            <div class="strength-fill" data-strength="0"></div>
        </div>
        <div class="strength-text">Password strength: <span>Weak</span></div>
    `;
    
    // Insert after the password input
    inputElement.parentNode.insertBefore(strengthBar, inputElement.nextSibling);
    
    inputElement.addEventListener('input', function() {
        updateStrengthIndicator(this.value, strengthBar);
    });
}

function updateStrengthIndicator(password, strengthBar) {
    const strengthFill = strengthBar.querySelector('.strength-fill');
    const strengthText = strengthBar.querySelector('.strength-text span');
    
    let strength = 0;
    let text = 'Weak';
    let color = '#e74c3c';
    
    if (password.length >= 8) strength += 25;
    if (/[A-Z]/.test(password)) strength += 25;
    if (/[0-9]/.test(password)) strength += 25;
    if (/[^A-Za-z0-9]/.test(password)) strength += 25;
    
    if (strength >= 75) {
        text = 'Strong';
        color = '#2ecc71';
    } else if (strength >= 50) {
        text = 'Medium';
        color = '#f39c12';
    } else if (password.length > 0) {
        text = 'Weak';
        color = '#e74c3c';
    } else {
        text = 'None';
        color = '#bdc3c7';
    }
    
    strengthFill.style.width = strength + '%';
    strengthFill.style.backgroundColor = color;
    strengthFill.setAttribute('data-strength', strength);
    strengthText.textContent = text;
    strengthText.style.color = color;
}

// Form validation and enhancement
document.addEventListener('DOMContentLoaded', function() {
    // Add real-time validation to forms
    const forms = document.querySelectorAll('form');
    
    forms.forEach(form => {
        const inputs = form.querySelectorAll('input[required]');
        
        inputs.forEach(input => {
            input.addEventListener('blur', function() {
                validateField(this);
            });
            
            input.addEventListener('input', function() {
                clearFieldError(this);
            });
        });
    });
    
    // File upload enhancement
    const fileInputs = document.querySelectorAll('input[type="file"]');
    fileInputs.forEach(input => {
        input.addEventListener('change', function() {
            const fileName = this.files[0] ? this.files[0].name : 'No file chosen';
            const label = this.previousElementSibling;
            if (label && label.tagName === 'LABEL') {
                label.textContent = fileName;
            }
        });
    });
});

function validateField(field) {
    clearFieldError(field);
    
    if (!field.value.trim()) {
        showFieldError(field, 'This field is required');
        return false;
    }
    
    if (field.type === 'email' && !isValidEmail(field.value)) {
        showFieldError(field, 'Please enter a valid email address');
        return false;
    }
    
    return true;
}

function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

function showFieldError(field, message) {
    field.classList.add('error');
    
    let errorElement = field.parentNode.querySelector('.field-error');
    if (!errorElement) {
        errorElement = document.createElement('div');
        errorElement.className = 'field-error';
        field.parentNode.appendChild(errorElement);
    }
    
    errorElement.textContent = message;
}

function clearFieldError(field) {
    field.classList.remove('error');
    
    const errorElement = field.parentNode.querySelector('.field-error');
    if (errorElement) {
        errorElement.remove();
    }
}

// Add CSS for password strength indicator and field errors
const style = document.createElement('style');
style.textContent = `
    .password-strength {
        margin-top: 8px;
    }
    
    .strength-bar {
        width: 100%;
        height: 4px;
        background-color: #ecf0f1;
        border-radius: 2px;
        overflow: hidden;
    }
    
    .strength-fill {
        height: 100%;
        width: 0%;
        transition: width 0.3s ease, background-color 0.3s ease;
        border-radius: 2px;
    }
    
    .strength-text {
        font-size: 12px;
        margin-top: 4px;
        color: #7f8c8d;
    }
    
    .strength-text span {
        font-weight: bold;
    }
    
    .field-error {
        color: #e74c3c;
        font-size: 12px;
        margin-top: 4px;
    }
    
    input.error {
        border-color: #e74c3c !important;
    }
    
    input.valid {
        border-color: #2ecc71 !important;
    }
`;
document.head.appendChild(style);