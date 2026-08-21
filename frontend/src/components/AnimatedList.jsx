import { useRef, useState, useEffect, useCallback } from 'react';
import { motion, useInView } from 'framer-motion';

const prefersReducedMotion =
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function AnimatedItem({ children, delay = 0, index, as = 'div', className = 'animated-list-item', onMouseEnter, onClick }) {
  const ref = useRef(null);
  const inView = useInView(ref, { amount: 0.5, once: true });
  const MotionTag = motion[as];

  const [hasMounted, setHasMounted] = useState(false);
  useEffect(() => {
    let raf1;
    let raf2;
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setHasMounted(true));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, []);

  const [isAnimating, setIsAnimating] = useState(false);

  const animate = hasMounted && inView ? { scale: 1, opacity: 1 } : { scale: 0.7, opacity: 0 };

  return (
    <MotionTag
      ref={ref}
      data-index={index}
      onMouseEnter={onMouseEnter}
      onClick={onClick}
      initial={{ scale: 0.7, opacity: 0 }}
      animate={animate}
      transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.2, delay }}
      onAnimationStart={() => setIsAnimating(true)}
      onAnimationComplete={() => setIsAnimating(false)}
      className={`${className} transform-gpu${isAnimating ? ' will-change-transform' : ''}`}
    >
      {children}
    </MotionTag>
  );
}

export function AnimatedList({
  items = [],
  onItemSelect,
  showGradients = true,
  enableArrowNavigation = true,
  className = '',
  itemClassName = '',
  displayScrollbar = true,
  initialSelectedIndex = -1,
}) {
  const listRef = useRef(null);
  const [selectedIndex, setSelectedIndex] = useState(initialSelectedIndex);
  const [keyboardNav, setKeyboardNav] = useState(false);
  const [topGradientOpacity, setTopGradientOpacity] = useState(0);
  const [bottomGradientOpacity, setBottomGradientOpacity] = useState(1);

  const handleItemMouseEnter = useCallback((index) => {
    setSelectedIndex(index);
  }, []);

  const handleItemClick = useCallback(
    (item, index) => {
      setSelectedIndex(index);
      if (onItemSelect) {
        onItemSelect(item, index);
      }
    },
    [onItemSelect]
  );

  function handleScroll(e) {
    const { scrollTop, scrollHeight, clientHeight } = e.target;
    setTopGradientOpacity(Math.min(scrollTop / 50, 1));
    const bottomDistance = scrollHeight - (scrollTop + clientHeight);
    setBottomGradientOpacity(scrollHeight <= clientHeight ? 0 : Math.min(bottomDistance / 50, 1));
  }

  useEffect(() => {
    if (!enableArrowNavigation) return;
    function handleKeyDown(e) {
      if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) {
        e.preventDefault();
        setKeyboardNav(true);
        setSelectedIndex((prev) => Math.min(prev + 1, items.length - 1));
      } else if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) {
        e.preventDefault();
        setKeyboardNav(true);
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter') {
        if (selectedIndex >= 0 && selectedIndex < items.length) {
          e.preventDefault();
          if (onItemSelect) {
            onItemSelect(items[selectedIndex], selectedIndex);
          }
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [items, selectedIndex, onItemSelect, enableArrowNavigation]);

  useEffect(() => {
    if (!keyboardNav || selectedIndex < 0 || !listRef.current) return;
    const container = listRef.current;
    const selectedItem = container.querySelector(`[data-index="${selectedIndex}"]`);
    if (selectedItem) {
      const extraMargin = 50;
      const containerScrollTop = container.scrollTop;
      const containerHeight = container.clientHeight;
      const itemTop = selectedItem.offsetTop;
      const itemBottom = itemTop + selectedItem.offsetHeight;
      if (itemTop < containerScrollTop + extraMargin) {
        container.scrollTo({ top: itemTop - extraMargin, behavior: 'smooth' });
      } else if (itemBottom > containerScrollTop + containerHeight - extraMargin) {
        container.scrollTo({
          top: itemBottom - containerHeight + extraMargin,
          behavior: 'smooth',
        });
      }
    }
    setKeyboardNav(false);
  }, [selectedIndex, keyboardNav]);

  return (
    <div className={`animated-list ${className}`}>
      <div
        ref={listRef}
        className={`animated-list-scroll${displayScrollbar ? ' slim-scroll' : ' animated-list-scroll--no-scrollbar'}`}
        onScroll={handleScroll}
      >
        {items.map((item, index) => (
          <AnimatedItem
            key={index}
            delay={0.1}
            index={index}
            onMouseEnter={() => handleItemMouseEnter(index)}
            onClick={() => handleItemClick(item, index)}
          >
            <div className={`animated-list-row${selectedIndex === index ? ' active' : ''} ${itemClassName}`}>
              <p className="animated-list-row-text">{item}</p>
            </div>
          </AnimatedItem>
        ))}
      </div>
      {showGradients && (
        <>
          <div
            className="animated-list-gradient animated-list-gradient--top"
            style={{ opacity: topGradientOpacity }}
          />
          <div
            className="animated-list-gradient animated-list-gradient--bottom"
            style={{ opacity: bottomGradientOpacity }}
          />
        </>
      )}
    </div>
  );
}
