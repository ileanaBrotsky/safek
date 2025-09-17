// frontend/src/components/RegistrationCodeModal.js
import React, { useState, useEffect } from 'react';
import { childrenService } from '../services/api';

const RegistrationCodeModal = ({ childId, childName, isOpen, onClose }) => {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [expiresAt, setExpiresAt] = useState('');

  useEffect(() => {
    if (isOpen && childId) {
      generateCode();
    }
  }, [isOpen, childId]);

  const generateCode = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await childrenService.generateRegistrationCode(childId);
      if (response.success) {
        setCode(response.data.code);
        setExpiresAt(new Date(response.data.expires_at).toLocaleString());
      } else {
        setError('Error generando código');
      }
    } catch (err) {
      console.error('Error:', err);
      setError('No se pudo generar el código de registro');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatCode = (code) => {
    if (code.length === 6) {
      return `${code.slice(0, 3)}-${code.slice(3)}`;
    }
    return code;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Código de Registro
          </h2>
          <p className="text-gray-600">
            Código de vinculación para el dispositivo de <span className="font-semibold">{childName}</span>
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
            <p className="text-red-600">{error}</p>
            <button
              onClick={generateCode}
              className="mt-2 text-sm text-red-700 underline hover:no-underline"
            >
              Reintentar
            </button>
          </div>
        ) : (
          <>
            {/* Código generado */}
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6 mb-6">
              <div className="text-center">
                <div className="text-4xl font-bold text-blue-600 mb-2 font-mono tracking-wider">
                  {formatCode(code)}
                </div>
                <p className="text-sm text-gray-600">
                  Válido hasta: {expiresAt}
                </p>
              </div>
              
              <button
                onClick={copyToClipboard}
                className={`mt-4 w-full py-2 px-4 rounded-lg font-medium transition-colors ${
                  copied 
                    ? 'bg-green-500 text-white' 
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {copied ? '✓ Copiado!' : 'Copiar Código'}
              </button>
            </div>

            {/* Instrucciones */}
            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <h3 className="font-semibold text-gray-900 mb-2">
                Instrucciones de instalación:
              </h3>
              <ol className="text-sm text-gray-600 space-y-2">
                <li className="flex">
                  <span className="font-bold mr-2">1.</span>
                  <span>Instala la app SafeKids en el dispositivo del menor</span>
                </li>
                <li className="flex">
                  <span className="font-bold mr-2">2.</span>
                  <span>Abre la app y selecciona "Vincular dispositivo"</span>
                </li>
                <li className="flex">
                  <span className="font-bold mr-2">3.</span>
                  <span>Ingresa el código: <strong>{formatCode(code)}</strong></span>
                </li>
                <li className="flex">
                  <span className="font-bold mr-2">4.</span>
                  <span>Acepta los permisos necesarios</span>
                </li>
              </ol>
            </div>

            {/* Botones de acción */}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  // Aquí podrías agregar lógica para enviar por WhatsApp
                  const message = `Código SafeKids para ${childName}: ${code}\nVálido hasta: ${expiresAt}`;
                  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
                  window.open(whatsappUrl, '_blank');
                }}
                className="flex-1 py-2 px-4 bg-green-500 text-white rounded-lg hover:bg-green-600 font-medium transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.149-.67.149-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
                  <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 16.853c-.14.394-.824 1.443-1.916 1.608-1.092.165-2.089-.068-3.394-.548-4.845-1.778-8.054-6.543-8.291-6.844-.236-.3-1.926-2.563-1.926-4.885 0-2.322 1.216-3.466 1.646-3.94.43-.474.932-.592 1.24-.592.308 0 .617.003.885.016.283.013.663-.107.95.724.288.831 1.03 2.514 1.12 2.697.09.184.15.397.03.636-.12.238-.18.388-.359.596-.18.209-.377.466-.537.626-.168.168-.343.35-.147.684.196.335.877 1.447 1.88 2.344 1.292 1.155 2.383 1.515 2.721 1.685.338.17.537.143.734-.087.198-.23.837-.972 1.06-1.306.224-.334.447-.279.746-.165.3.113 1.897.894 2.223 1.057.326.163.545.244.622.382.077.138.077.802-.062 1.196z"/>
                </svg>
                WhatsApp
              </button>
              
              <button
                onClick={generateCode}
                className="flex-1 py-2 px-4 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 font-medium transition-colors"
              >
                Generar Nuevo
              </button>
            </div>
          </>
        )}

        {/* Botón cerrar */}
        <button
          onClick={onClose}
          className="mt-6 w-full py-2 px-4 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium transition-colors"
        >
          Cerrar
        </button>
      </div>
    </div>
  );
};

export default RegistrationCodeModal;