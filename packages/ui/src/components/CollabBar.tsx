import React from "react";

import "./CollabBar.scss";

export interface CollabBarProps {
  children?: React.ReactNode;
}

export const CollabBar: React.FC<CollabBarProps> = ({ children }) => {
  return (
    <div
      className="firo-collab-bar"
      role="region"
      aria-label="Collaboration Bar"
    >
      <div className="firo-collab-bar__content">{children}</div>
    </div>
  );
};
