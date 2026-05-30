"use client";

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { cn } from '../../lib/utils';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { CheckCircle2, Mail, Lock, User, Shield, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import GoogleSignInButton from './GoogleSignInButton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';

// Field type definition
interface FieldOption {
  value: string;
  label: string;
}

interface FormField {
  name: string;
  label: string;
  type: string;
  placeholder: string;
  icon: any;
  options?: FieldOption[];
}

const signupStep = {
  id: 'google-signup',
  title: 'Sign Up with Google',
  description: 'Create your account using Google and complete your profile.',
  schema: z.object({}),
  icon: User,
  fields: [] as FormField[],
};

interface AuthMultiStepFormProps {
  className?: string;
  onComplete?: () => void;
  mode?: 'signup' | 'login';
}

export default function AuthMultiStepForm({
  className,
  onComplete,
  mode = 'signup',
}: AuthMultiStepFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [error, setError] = useState<string>('');
  const [selectedRole, setSelectedRole] = useState<string>('user');
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});

  const { login, adminLogin, loginWithGoogle, logout } = useAuth();

  // Simple login step
  const loginStep = {
    id: 'login',
    title: 'Welcome Back',
    description: 'Sign in to your account',
    schema: z.object({
      email: z.string().email('Please enter a valid email address'),
      password: z.string().min(1, 'Password is required'),
      role: z.string().optional(),
    }),
    icon: Lock,
    fields: [
      {
        name: 'role',
        label: 'Login As',
        type: 'select',
        placeholder: 'Select your role',
        icon: Shield,
        options: [
          { value: 'user', label: 'User' },
          { value: 'admin', label: 'Admin' },
          { value: 'owner', label: 'Owner' },
        ],
      },
      {
        name: 'email',
        label: 'Email',
        type: 'email',
        placeholder: 'john.doe@example.com',
        icon: Mail,
      },
      {
        name: 'password',
        label: 'Password',
        type: 'password',
        placeholder: '••••••••',
        icon: Lock,
      },
    ],
  };

  const currentStep = mode === 'signup' ? signupStep : loginStep;
  const currentStepSchema = currentStep.schema as z.ZodType<any, any, any>;

  // Setup form with the current step schema
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<any>({
    resolver: zodResolver(currentStepSchema),
  });

  // Handle Google Sign In
  const handleGoogleSignIn = async () => {
    try {
      setError('');
      setIsSubmitting(true);
      await loginWithGoogle();

      if (mode === 'login' && (selectedRole === 'admin' || selectedRole === 'owner')) {
        const token = localStorage.getItem('token');
        if (!token) {
          throw new Error('Authentication token not found. Please try again.');
        }

        const response = await fetch('/api/auth/me', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        const result = await response.json();
        if (!response.ok) {
          throw new Error(result?.message || 'Failed to verify account role.');
        }

        const role = result?.data?.user?.role;
        const hasAdminAccess = selectedRole === 'owner'
          ? role === 'owner'
          : role === 'admin' || role === 'owner';

        if (!hasAdminAccess) {
          await logout();
          throw new Error(`You are not ${selectedRole}. Please login as a user.`);
        }

        setIsComplete(true);
        window.location.href = '/admin';
        return;
      }

      setIsComplete(true);

      if (mode === 'signup') {
        window.location.href = '/profile?onboarding=1';
        return;
      }

      if (onComplete) onComplete();
    } catch (error: any) {
      const errorMessage = error.message || 'Failed to sign in with Google';
      setError(errorMessage);
      if (errorMessage.includes('Please login as a user.')) {
        alert(errorMessage);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle next step or final submission
const handleNextStep = async (data: any) => {
  try {
    setError('');
    if (mode === 'login') {
      setIsSubmitting(true);

      if (selectedRole === 'admin' || selectedRole === 'owner') {
        await adminLogin(data.email, data.password, selectedRole);
        setIsComplete(true);
        window.location.href = '/admin';
        return;
      }

      await login(data.email, data.password);
      setIsComplete(true);
      if (onComplete) onComplete();
    }
  } catch (error: any) {
    // This will catch and display the specific error message from signup/login
    const errorMessage = error.message || 'Failed to create account. Please try again.';
    setError(errorMessage);
    if (errorMessage.includes('Please login as a user.')) {
      alert(errorMessage);
    }
    if ((process.env.NODE_ENV === "development")) {
      console.error('Authentication error:', error);
    }
  } finally {
    setIsSubmitting(false);
  }
};

  const togglePasswordVisibility = (fieldName: string) => {
    setShowPasswords((prev) => ({
      ...prev,
      [fieldName]: !prev[fieldName],
    }));
  };

  // Animation variants
  const variants = {
    hidden: { opacity: 0, x: 50 },
    visible: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -50 },
  };

  return (
    <div
      className={cn(
        'bg-white dark:bg-gray-800 mx-auto w-full max-w-md rounded-xl p-8 shadow-2xl border border-gray-200 dark:border-gray-700',
        className,
      )}
    >
      {!isComplete ? (
        <>
          <motion.div
            key={mode}
            initial="hidden"
            animate="visible"
            variants={variants}
            transition={{ duration: 0.3 }}
          >
              <div className="mb-6 text-center">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                  {currentStep.title}
                </h2>
                <p className="text-gray-600 dark:text-gray-400">
                  {currentStep.description}
                </p>
              </div>

              {mode === 'signup' && (
                <div className="space-y-4">
                  <p className="text-sm text-center text-gray-600 dark:text-gray-400">
                    Sign up is available only with Google. You can change your password later from your profile page.
                  </p>
                  <GoogleSignInButton
                    onClick={handleGoogleSignIn}
                    disabled={isSubmitting}
                    text="Continue with Google"
                  />
                </div>
              )}

              {mode !== 'signup' && (
                <>
                  <div className="mb-6">
                    <GoogleSignInButton onClick={handleGoogleSignIn} disabled={isSubmitting} text="Sign in with Google" />
                  </div>

                  <div className="relative mb-6">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-gray-300 dark:border-gray-600" />
                    </div>
                    <div className="relative flex justify-center text-sm">
                      <span className="bg-white dark:bg-gray-800 px-2 text-gray-500 dark:text-gray-400">
                        Or continue with email
                      </span>
                    </div>
                  </div>
                </>
              )}

              {error && (
                <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                </div>
              )}

              {mode !== 'signup' && (
                <form
                  onSubmit={handleSubmit(handleNextStep)}
                  className="space-y-4"
                >
                  {loginStep.fields.map((field) => {
                    const IconComponent = field.icon;

                    if (field.type === 'select' && 'options' in field && field.options) {
                      return (
                        <div key={field.name} className="space-y-2">
                          <Label htmlFor={field.name} className="text-gray-700 dark:text-gray-300 font-medium">
                            {field.label}
                          </Label>
                          <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
                              <IconComponent className="h-5 w-5 text-gray-400" />
                            </div>
                            <Select
                              value={selectedRole}
                              onValueChange={(value) => {
                                setSelectedRole(value);
                              }}
                            >
                              <SelectTrigger className="pl-10 h-12 border-gray-300 dark:border-gray-600">
                                <SelectValue placeholder={field.placeholder} />
                              </SelectTrigger>
                              <SelectContent>
                                {field.options.map((option: FieldOption) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div key={field.name} className="space-y-2">
                        <Label htmlFor={field.name} className="text-gray-700 dark:text-gray-300 font-medium">
                          {field.label}
                        </Label>
                        <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <IconComponent className="h-5 w-5 text-gray-400" />
                          </div>
                          <Input
                            id={field.name}
                            type={field.type === 'password' && showPasswords[field.name] ? 'text' : field.type}
                            placeholder={field.placeholder}
                            {...register(field.name as any)}
                            className={cn(
                              'pl-10 h-12 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-transparent',
                              field.type === 'password' && 'pr-12',
                              errors[field.name as string] && 'border-red-500 focus:ring-red-500',
                            )}
                          />
                          {field.type === 'password' && (
                            <button
                              type="button"
                              onClick={() => togglePasswordVisibility(field.name)}
                              className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                              aria-label={showPasswords[field.name] ? 'Hide password' : 'Show password'}
                            >
                              {showPasswords[field.name] ? (
                                <EyeOff className="h-5 w-5" />
                              ) : (
                                <Eye className="h-5 w-5" />
                              )}
                            </button>
                          )}
                        </div>
                        {errors[field.name as string] && (
                          <p className="text-red-500 text-sm flex items-center gap-1">
                            <span className="w-1 h-1 bg-red-500 rounded-full"></span>
                            {errors[field.name as string]?.message as string}
                          </p>
                        )}
                      </div>
                    );
                  })}

                  <div className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-sm shrink-0">
                      <Link href="/auth/reset" className="text-blue-600 hover:underline">
                        Forgot password?
                      </Link>
                    </div>
                    <Button
                      type="submit"
                      disabled={isSubmitting}
                      className={cn(
                        'w-full bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg font-medium transition-all sm:w-auto',
                        mode === 'login' && 'sm:min-w-44',
                      )}
                    >
                      {isSubmitting ? (
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Signing In...
                        </div>
                      ) : (
                        'Sign In'
                      )}
                    </Button>
                  </div>
                </form>
              )}
            </motion.div>
        </>
      ) : (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="py-10 text-center"
        >
          <div className="bg-green-100 dark:bg-green-900/20 mb-6 inline-flex h-20 w-20 items-center justify-center rounded-full">
            <CheckCircle2 className="text-green-600 dark:text-green-400 h-10 w-10" />
          </div>
          <h2 className="mb-3 text-2xl font-bold text-gray-900 dark:text-white">
            {mode === 'signup' ? 'Account Created!' : 'Welcome Back!'}
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            {mode === 'signup' 
              ? 'Your account has been successfully created. Welcome to ABjee Travel!'
              : 'You have successfully signed in to your account.'
            }
          </p>
        </motion.div>
      )}
    </div>
  );
}

