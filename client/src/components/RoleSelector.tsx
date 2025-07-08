import { Search, TrendingUp, Code, PenTool, Palette, Plus } from "lucide-react";
import type { RoleOption } from "@/types";

interface RoleSelectorProps {
  value: string;
  onChange: (value: string) => void;
}

const roleOptions = [
  {
    value: "researcher",
    label: "Researcher",
    description: "Data analysis & research",
    icon: Search,
    gradient: "bg-gradient-to-r from-purple-500 to-pink-500"
  },
  {
    value: "product_manager",
    label: "Product Manager",
    description: "Strategic planning",
    icon: TrendingUp,
    gradient: "bg-gradient-to-r from-blue-500 to-cyan-500"
  },
  {
    value: "developer",
    label: "Software Developer",
    description: "Code & architecture",
    icon: Code,
    gradient: "bg-gradient-to-r from-green-500 to-teal-500"
  },
  {
    value: "content_writer",
    label: "Content Writer",
    description: "Creative writing",
    icon: PenTool,
    gradient: "bg-gradient-to-r from-orange-500 to-red-500"
  },
  {
    value: "designer",
    label: "Designer",
    description: "Creative feedback",
    icon: Palette,
    gradient: "bg-gradient-to-r from-pink-500 to-rose-500"
  },
  {
    value: "custom",
    label: "Others",
    description: "Custom role",
    icon: Plus,
    gradient: "bg-gradient-to-r from-gray-500 to-gray-600"
  }
];

export default function RoleSelector({ value, onChange }: RoleSelectorProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {roleOptions.map((role) => {
        const IconComponent = role.icon;
        return (
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
                <IconComponent className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-medium text-gray-900">{role.label}</p>
                <p className="text-sm text-gray-500">{role.description}</p>
              </div>
            </label>
          </div>
        );
      })}
    </div>
  );
}
