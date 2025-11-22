import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  fullWidth?: boolean;
}

export const Button: React.FC<ButtonProps> = ({ 
  children, 
  variant = 'primary', 
  fullWidth = false,
  className = '',
  ...props 
}) => {
  const baseStyles = "font-mono uppercase tracking-widest text-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center";
  
  const variants = {
    primary: "bg-white text-black hover:bg-gray-200 font-bold py-3 px-6 md:py-4 md:px-8 shadow-[0_0_15px_rgba(255,255,255,0.1)]",
    secondary: "border border-white/20 text-white/70 hover:text-white hover:border-white hover:bg-white/5 py-2 px-4 md:py-3 md:px-6",
    danger: "border border-danger/50 text-danger hover:bg-danger hover:text-white py-2 px-4 md:py-3 md:px-6",
    ghost: "text-white/50 hover:text-white py-2 px-4"
  };

  return (
    <button 
      className={`${baseStyles} ${variants[variant]} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};