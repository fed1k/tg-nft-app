import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  position?: 'center' | 'top' | 'bottom';   // ← New: Control vertical position
  animation?: 'scale' | 'slide-down' | 'slide-up';
  className?: string;        // Custom class for the modal panel
  headerClassName?: string;  // Custom header styling
  contentClassName?: string;
  showCloseButton?: boolean;
}

export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  position = 'center',
  animation = 'scale',
  className = '',
  headerClassName = '',
  contentClassName = '',
  showCloseButton = true,
}: ModalProps) {
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [isAnimated, setIsAnimated] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      // Small delay to ensure browser paints before adding animation classes
      const timeout = setTimeout(() => setIsAnimated(true), 10);
      return () => clearTimeout(timeout);
    } else {
      setIsAnimated(false);
      const timeout = setTimeout(() => setShouldRender(false), 300); // match duration-300
      return () => clearTimeout(timeout);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();

    if (isOpen) {
      document.addEventListener('keydown', handleEsc);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!shouldRender) return null;

  // Position & Animation Classes
  const positionClasses = {
    center: 'items-center p-4',
    top: 'items-start pt-10 px-4',
    bottom: 'items-end', 
  };

  const animationClasses = {
    scale: 'opacity-0 scale-95',
    'slide-down': 'opacity-0 -translate-y-full',
    'slide-up': 'opacity-0 translate-y-full',
  };

  const openAnimation = {
    scale: 'opacity-100 scale-100',
    'slide-down': 'opacity-100 translate-y-0',
    'slide-up': 'opacity-100 translate-y-0',
  };

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/60 z-50 transition-opacity duration-300 ease-out ${isAnimated ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />

      {/* Modal Wrapper — clicking outside the panel closes the modal */}
      <div
        className={`fixed inset-0 z-[200] flex ${positionClasses[position]} justify-center`}
        onClick={onClose}
      >
        <div
          className={`bg-white rounded-3xl shadow-2xl w-full  
            transition-all duration-300 ease-out 
            ${isAnimated ? openAnimation[animation] : animationClasses[animation]} ${className}`}
          onClick={(e) => e.stopPropagation()}
        >

          {/* Content */}
          <div className={`p-6 ${contentClassName}`}>{children}</div>
        </div>
      </div>
    </>,
    document.body
  );
}