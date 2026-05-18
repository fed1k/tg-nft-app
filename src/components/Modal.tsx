import { useEffect } from 'react';
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

  if (!isOpen) return null;



  // Position & Animation Classes
  const positionClasses = {
    center: 'items-center',
    top: 'items-start pt-10',
    bottom: 'items-end pb-10',
  };

  const animationClasses = {
    scale: 'scale-95',
    'slide-down': 'translate-y-[-20px]',
    'slide-up': 'translate-y-8',
  };

  const openAnimation = {
    scale: 'scale-100',
    'slide-down': 'translate-y-0',
    'slide-up': 'translate-y-0',
  };

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 z-50"
        onClick={onClose}
      />

      {/* Modal Wrapper — clicking outside the panel closes the modal */}
      <div
        className={`fixed inset-0 z-200 flex ${positionClasses[position]} justify-center p-4`}
        onClick={onClose}
      >
        <div
          className={`bg-white rounded-3xl shadow-2xl w-full  
            transition-all duration-300 ease-out ${animationClasses[animation]} 
            ${isOpen ? openAnimation[animation] : ''} ${className}`}
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