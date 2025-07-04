import { useState } from "react";
import type { RoleOption } from "@/types";

interface RoleSelectorProps {
  value: string;
  onChange: (value: string) => void;
}

const roleOptions: RoleOption[] = [
  {
    value: "researcher",
    label: "Researcher",
    description: "Data analysis & research",
    icon: "fas fa-search",
    gradient: "role-researcher"
  },
  {
    value: "product_manager",
    label: "Product Manager",
    description: "Strategic planning",
    icon: "fas fa-chart-line",
    gradient: "role-pm"
  },
  {
    value: "developer",
    label: "Software Developer",
    description: "Code & architecture",
    icon: "fas fa-code",
    gradient: "role-developer"
  },
  {
    value: "content_writer",
    label: "Content Writer",
    description: "Creative writing",
    icon: "fas fa-pen-fancy",
    gradient: "role-writer"
  },
  {
    value: "designer",
    label: "Designer",
    description: "Creative feedback",
    icon: "fas fa-palette",
    gradient: "role-designer"
  },
  {
    value: "custom",
    label: "Others",
    description: "Custom role",
    icon: "fas fa-plus",
    gradient: "role-custom"
  }
];

export default function RoleSelector({ value, onChange }: RoleSelectorProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {roleOptions.map((role) => (
        <div key={role.value} className="relative">
          <input
            type="radio"
            name="role"
            value={role.value}
            checked={value === role.value}
            onChange={(e) => onChange(e.target.value)}
            className="peer sr-only"
          />
          <label className="flex items-center p-4 rounded-xl border-2 border-gray-200 cursor-pointer hover:border-blue-500 peer-checked:border-blue-500 peer-checked:bg-blue-50 transition-all duration-200">
            <div className={`w-10 h-10 ${role.gradient} rounded-lg flex items-center justify-center mr-3`}>
              <i className={`${role.icon} text-white`}></i>
            </div>
            <div>
              <p className="font-medium text-gray-900">{role.label}</p>
              <p className="text-sm text-gray-500">{role.description}</p>
            </div>
          </label>
        </div>
      ))}
    </div>
  );
}
