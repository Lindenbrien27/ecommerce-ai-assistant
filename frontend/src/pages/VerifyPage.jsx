import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { VerifyForm } from '../components/VerifyForm.jsx';

export function VerifyPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  function handleVerified(token) {
    login(token);
    navigate('/orders');
  }

  return (
    <main>
      <VerifyForm onVerified={handleVerified} />
    </main>
  );
}
