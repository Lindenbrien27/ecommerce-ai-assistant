import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { VerifyForm } from '../components/VerifyForm.jsx';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';

export function VerifyPage() {
  useDocumentTitle('Verify your order');
  const { login } = useAuth();
  const navigate = useNavigate();

  function handleVerified(token) {
    login(token);
    navigate('/orders');
  }

  return (
    <div className="app-shell">
      <main>
        <VerifyForm onVerified={handleVerified} />
      </main>
    </div>
  );
}
