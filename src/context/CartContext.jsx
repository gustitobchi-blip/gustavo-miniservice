'use client';

import { createContext, useContext, useReducer, useState, useRef, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

const CartContext = createContext(null);

// El carrito vivía sólo en memoria: bastaba un F5 para perder toda la compra.
const CLAVE_LOCAL = 'gustavo-carrito';

const cartReducer = (state, action) => {
  switch (action.type) {
    case 'ADD_ITEM': {
      const existing = state.items.find(i => i.id === action.payload.id);
      if (existing) {
        return {
          ...state,
          items: state.items.map(i =>
            i.id === action.payload.id
              ? { ...i, cantidad: i.cantidad + 1 }
              : i
          ),
        };
      }
      return { ...state, items: [...state.items, { ...action.payload, cantidad: 1 }] };
    }

    // Carga de varios de una (volver a pedir). Fija la cantidad en vez de
    // sumarla: apretar "volver a pedir" dos veces tiene que dejar el mismo
    // carrito, no el doble.
    case 'ADD_ITEMS': {
      const items = [...state.items];
      action.payload.forEach(({ producto, cantidad }) => {
        const i = items.findIndex(x => x.id === producto.id);
        if (i >= 0) items[i] = { ...items[i], ...producto, cantidad };
        else items.push({ ...producto, cantidad });
      });
      return { ...state, items };
    }

    case 'SET_ITEMS':
      return { ...state, items: action.payload };

    case 'REMOVE_ITEM':
      return { ...state, items: state.items.filter(i => i.id !== action.payload) };

    case 'UPDATE_CANTIDAD': {
      if (action.payload.cantidad <= 0) {
        return { ...state, items: state.items.filter(i => i.id !== action.payload.id) };
      }
      return {
        ...state,
        items: state.items.map(i =>
          i.id === action.payload.id ? { ...i, cantidad: action.payload.cantidad } : i
        ),
      };
    }

    case 'CLEAR_CART':
      return { ...state, items: [] };

    case 'TOGGLE_CART':
      return { ...state, isOpen: !state.isOpen };

    case 'OPEN_CART':
      return { ...state, isOpen: true };

    case 'CLOSE_CART':
      return { ...state, isOpen: false };

    default:
      return state;
  }
};

const initialState = { items: [], isOpen: false };

function leerLocal() {
  try {
    const crudo = localStorage.getItem(CLAVE_LOCAL);
    const items = crudo ? JSON.parse(crudo) : [];
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

export function CartProvider({ children }) {
  const [state, dispatch] = useReducer(cartReducer, initialState);
  const [cartToast, setCartToast] = useState({ visible: false, nombre: '', imagen: '' });
  const toastTimer = useRef(null);

  const [usuarioId, setUsuarioId] = useState(null);
  // Hasta que no se terminó de leer lo guardado no se escribe nada, o el
  // carrito vacío del arranque pisaría lo que había.
  const [hidratado, setHidratado] = useState(false);
  const [recuperado, setRecuperado] = useState(false);

  // ── Recuperar lo que había ────────────────────────────────────
  useEffect(() => {
    const supabase = createClient();
    const locales = leerLocal();
    if (locales.length) dispatch({ type: 'SET_ITEMS', payload: locales });

    const sincronizar = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        setUsuarioId(user?.id || null);

        if (user) {
          const { data } = await supabase
            .from('carritos')
            .select('items')
            .eq('cliente_id', user.id)
            .maybeSingle();

          const guardados = Array.isArray(data?.items) ? data.items : [];
          // Si en este dispositivo no hay nada, se recupera el carrito que
          // quedó abierto en otro lado.
          if (!locales.length && guardados.length) {
            dispatch({ type: 'SET_ITEMS', payload: guardados });
            setRecuperado(true);
          }
        }
      } catch {
        // Sin la tabla `carritos` el carrito sigue andando, sólo que local.
      }
      setHidratado(true);
    };

    sincronizar();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((evento) => {
      if (evento === 'SIGNED_OUT') setUsuarioId(null);
      if (evento === 'SIGNED_IN')  sincronizar();
    });
    return () => subscription.unsubscribe();
  }, []);

  // ── Guardar en cada cambio ────────────────────────────────────
  useEffect(() => {
    if (!hidratado) return;

    try {
      localStorage.setItem(CLAVE_LOCAL, JSON.stringify(state.items));
    } catch {
      // Ventana privada o storage lleno: el carrito sigue en memoria.
    }

    if (!usuarioId) return;
    // Debounce: sumar 5 unidades no son 5 escrituras a la base.
    const timer = setTimeout(async () => {
      try {
        await createClient().from('carritos').upsert({
          cliente_id:     usuarioId,
          items:          state.items,
          actualizado_en: new Date().toISOString(),
        });
      } catch {
        // Idem: que no se pueda guardar no puede romper la compra.
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [state.items, usuarioId, hidratado]);

  const totalItems  = state.items.reduce((sum, i) => sum + i.cantidad, 0);
  const totalPrecio = state.items.reduce((sum, i) => sum + i.precio * i.cantidad, 0);

  const addItem = (producto) => {
    dispatch({ type: 'ADD_ITEM', payload: producto });
    // Mostrar toast sin abrir el drawer
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setCartToast({ visible: true, nombre: producto.nombre, imagen: producto.imagen || '' });
    toastTimer.current = setTimeout(() => setCartToast({ visible: false, nombre: '', imagen: '' }), 2500);
  };

  /** @param {Array<{producto: object, cantidad: number}>} lista */
  const addItems = useCallback((lista) => {
    if (!lista?.length) return;
    dispatch({ type: 'ADD_ITEMS', payload: lista });
  }, []);

  const removeItem      = (id)             => dispatch({ type: 'REMOVE_ITEM',      payload: id });
  const updateCantidad  = (id, cantidad)   => dispatch({ type: 'UPDATE_CANTIDAD',  payload: { id, cantidad } });
  const clearCart       = ()               => dispatch({ type: 'CLEAR_CART' });
  const toggleCart      = ()               => dispatch({ type: 'TOGGLE_CART' });
  const openCart        = ()               => dispatch({ type: 'OPEN_CART' });
  const closeCart       = ()               => dispatch({ type: 'CLOSE_CART' });

  return (
    <CartContext.Provider value={{
      items: state.items,
      isOpen: state.isOpen,
      totalItems,
      totalPrecio,
      cartToast,
      recuperado,
      ocultarRecuperado: () => setRecuperado(false),
      addItem,
      addItems,
      removeItem,
      updateCantidad,
      clearCart,
      toggleCart,
      openCart,
      closeCart,
    }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart debe usarse dentro de CartProvider');
  return context;
}
