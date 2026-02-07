import { useState, useEffect, useRef } from "react";

type Option = {
  id: string;
  label: string;
};

type SearchableSelectProps = {
  options: Option[];
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  isLoading?: boolean;
};

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Select...",
  disabled = false,
  isLoading = false,
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Находим выбранную опцию для отображения
  const selectedOption = options.find((opt) => opt.id === value);

  // Фильтруем опции по введенному тексту
  const filteredOptions = options.filter((opt) =>
    opt.label.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Закрытие при клике снаружи
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        // Сбрасываем поиск при закрытии, чтобы при следующем открытии было чисто
        setSearchTerm(""); 
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (optionId: string | null) => {
    onChange(optionId);
    setIsOpen(false);
    setSearchTerm("");
  };

  return (
    <div className="relative w-full" ref={wrapperRef}>
      {/* Поле ввода (оно же триггер) */}
      <div
        className={`flex w-full items-center justify-between rounded-md border bg-white px-3 py-2 text-sm transition-colors 
        ${disabled ? "cursor-not-allowed bg-zinc-100 text-zinc-400 border-zinc-200" : "cursor-text border-zinc-300 hover:border-zinc-400 focus-within:border-zinc-900 focus-within:ring-1 focus-within:ring-zinc-900"}`}
        onClick={() => {
          if (!disabled) {
            setIsOpen(true);
          }
        }}
      >
        <input
          type="text"
          className="w-full bg-transparent focus:outline-none disabled:cursor-not-allowed"
          placeholder={selectedOption ? selectedOption.label : placeholder}
          value={isOpen ? searchTerm : (selectedOption?.label || "")}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          disabled={disabled}
          // Когда инпут в фокусе, но мы не пишем — показываем placeholder или выбранное значение
          // Хитрость: когда открыто, value=searchTerm. Когда закрыто — выбранный label.
        />
        
        {/* Иконка стрелочки или загрузки */}
        <div className="ml-2 flex shrink-0 items-center">
          {isLoading ? (
             <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-600"></span>
          ) : (
            <svg
              className={`h-4 w-4 text-zinc-500 transition-transform ${isOpen ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          )}
        </div>
      </div>

      {/* Выпадающий список */}
      {isOpen && !disabled && (
        <div className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border border-zinc-200 bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
          {/* Опция сброса (если нужно) */}
          <div
            className="cursor-pointer select-none px-4 py-2 text-zinc-500 hover:bg-zinc-100 italic"
            onClick={() => handleSelect(null)}
          >
            No selection
          </div>

          {filteredOptions.length === 0 ? (
            <div className="px-4 py-2 text-zinc-500">No results found</div>
          ) : (
            filteredOptions.map((option) => (
              <div
                key={option.id}
                className={`cursor-pointer select-none px-4 py-2 hover:bg-zinc-100 ${
                  value === option.id ? "bg-zinc-50 font-medium text-zinc-900" : "text-zinc-700"
                }`}
                onClick={() => handleSelect(option.id)}
              >
                {option.label}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}