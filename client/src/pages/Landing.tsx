import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Brain, Rocket, Users, Shield, Sparkles, ArrowRight } from "lucide-react";

export default function Landing() {
  const handleLogin = () => {
    window.location.href = "/api/login";
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-100/20 to-purple-100/20"></div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <div className="text-center">
            <div className="flex items-center justify-center mb-8">
              <div className="w-20 h-20 gradient-bg rounded-2xl flex items-center justify-center animate-float">
                <Brain className="w-10 h-10 text-white" />
              </div>
            </div>
            <h1 className="text-4xl sm:text-6xl font-bold text-gray-900 mb-6">
              Meet <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">InquiroAI</span>
            </h1>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto mb-8">
              The intelligent AI conversation platform that transforms how you interact with multiple AI providers through structured, role-based prompting.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button
                onClick={handleLogin}
                size="lg"
                className="gradient-bg hover:shadow-lg transition-all duration-200 text-white px-8 py-4 text-lg"
              >
                Get Started Free
                <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
              <Button 
                variant="outline" 
                size="lg"
                className="px-8 py-4 text-lg border-2 hover:bg-gray-50"
              >
                Watch Demo
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Why Choose InquiroAI?
            </h2>
            <p className="text-xl text-gray-600">
              Experience the next generation of AI conversations with powerful features designed for professionals.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <Card className="p-6 hover:shadow-lg transition-shadow duration-200">
              <CardContent className="p-0">
                <div className="w-12 h-12 role-researcher rounded-xl flex items-center justify-center mb-4">
                  <Users className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">Role-Based Prompting</h3>
                <p className="text-gray-600">
                  Choose from predefined roles like Researcher, Developer, or Content Writer, or create your own custom role for tailored AI responses.
                </p>
              </CardContent>
            </Card>

            <Card className="p-6 hover:shadow-lg transition-shadow duration-200">
              <CardContent className="p-0">
                <div className="w-12 h-12 role-developer rounded-xl flex items-center justify-center mb-4">
                  <Rocket className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">Multi-Provider Support</h3>
                <p className="text-gray-600">
                  Connect with OpenAI, Google Gemini, Anthropic Claude, and Grok through a single interface with intelligent model selection.
                </p>
              </CardContent>
            </Card>

            <Card className="p-6 hover:shadow-lg transition-shadow duration-200">
              <CardContent className="p-0">
                <div className="w-12 h-12 role-pm rounded-xl flex items-center justify-center mb-4">
                  <Shield className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">Bring Your Own Keys</h3>
                <p className="text-gray-600">
                  Maintain complete control over your data and costs by using your own API keys, securely encrypted and stored.
                </p>
              </CardContent>
            </Card>

            <Card className="p-6 hover:shadow-lg transition-shadow duration-200">
              <CardContent className="p-0">
                <div className="w-12 h-12 role-writer rounded-xl flex items-center justify-center mb-4">
                  <Sparkles className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">Structured Conversations</h3>
                <p className="text-gray-600">
                  Define context, tasks, constraints, and examples through our comprehensive 9-field configuration system.
                </p>
              </CardContent>
            </Card>

            <Card className="p-6 hover:shadow-lg transition-shadow duration-200">
              <CardContent className="p-0">
                <div className="w-12 h-12 role-designer rounded-xl flex items-center justify-center mb-4">
                  <Brain className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">File Upload Support</h3>
                <p className="text-gray-600">
                  Upload PDF, Excel, Word, and Markdown files to provide context and examples for more accurate AI responses.
                </p>
              </CardContent>
            </Card>

            <Card className="p-6 hover:shadow-lg transition-shadow duration-200">
              <CardContent className="p-0">
                <div className="w-12 h-12 role-custom rounded-xl flex items-center justify-center mb-4">
                  <Users className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">Real-Time Collaboration</h3>
                <p className="text-gray-600">
                  Experience seamless real-time conversations with typing indicators and instant message delivery.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="py-20 bg-gradient-to-r from-blue-600 to-purple-600">
        <div className="max-w-4xl mx-auto text-center px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-6">
            Ready to Transform Your AI Conversations?
          </h2>
          <p className="text-xl text-blue-100 mb-8">
            Join thousands of professionals who are already using InquiroAI to get better results from their AI interactions.
          </p>
          <Button
            onClick={handleLogin}
            size="lg"
            className="bg-white text-blue-600 hover:bg-gray-50 px-8 py-4 text-lg font-semibold"
          >
            Start Your Free Trial
            <ArrowRight className="ml-2 w-5 h-5" />
          </Button>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-center">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 gradient-bg rounded-xl flex items-center justify-center">
                <Brain className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-xl font-bold">InquiroAI</h3>
                <p className="text-gray-400">Intelligent AI Conversations</p>
              </div>
            </div>
          </div>
          <div className="mt-8 text-center text-gray-400">
            <p>&copy; 2024 InquiroAI. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
