import { lazy, Suspense } from 'react';
import { Route, Routes, Navigate } from 'react-router-dom';
import { LoadingSpinner } from '@react-mono/shop-shared-ui';
import './app.css';

// Lazy load feature components
const ProductList = lazy(() => import('@react-mono/shop-feature-products').then(m => ({ default: m.ProductList })));
const ProductDetail = lazy(() => import('@react-mono/shop-feature-product-detail').then(m => ({ default: m.ProductDetail })));

export function App() {
  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <h1 className="app-title">Nx Shop Demo</h1>
        </div>
      </header>

      <main className="app-main">
        <Suspense fallback={<LoadingSpinner />}>
          <Routes>
            <Route path="/" element={<Navigate to="/products" replace />} />
            <Route path="/products" element={<ProductList />} />
            <Route path="/products/:id" element={<ProductDetail />} />
            <Route path="*" element={<Navigate to="/products" replace />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  );
}

export default App;
