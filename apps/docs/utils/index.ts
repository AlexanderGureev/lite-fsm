/**
 * Функция debounce позволяет отложить вызов функции до тех пор, 
 * пока не пройдет определенное время после последнего вызова.
 * 
 * @param func Функция, вызов которой нужно отложить
 * @param wait Время ожидания в миллисекундах
 * @returns Функция с отложенным вызовом
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  
  return function(...args: Parameters<T>): void {
    const later = () => {
      timeout = null;
      func(...args);
    };
    
    if (timeout !== null) {
      clearTimeout(timeout);
    }
    
    timeout = setTimeout(later, wait);
  };
} 