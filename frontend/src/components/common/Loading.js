// src/components/common/Loading.js
import React from 'react';
import { Shield } from 'lucide-react';

const Loading = ({ message = 'Cargando...' }) => {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="relative">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-gray-200 border-t-blue-600 mx-auto mb-4"></div>
          <Shield className="h-6 w-6 text-blue-600 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2" />
        </div>
        <p className="text-gray-600 font-medium">{message}</p>
        <p className="text-gray-400 text-sm mt-1">SafeKids</p>
      </div>
    </div>
  );
};

export default Loading;