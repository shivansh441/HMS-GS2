import React from 'react';

interface BackLinkButtonProps {
  children: React.ReactNode;
  onClick: () => void;
}

export const BackLinkButton: React.FC<BackLinkButtonProps> = ({ children, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="text-sm font-medium text-blue-700 hover:underline dark:text-blue-300"
  >
    {children}
  </button>
);
