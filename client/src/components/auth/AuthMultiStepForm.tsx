import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { cn } from '../../lib/utils';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Progress } from '../../components/ui/progress';
import { CheckCircle2, ArrowRight, ArrowLeft, Mail, Lock, User, MapPin, Shield } from 'lucide-react';
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

// Define the form schema for each step
const personalInfoSchema = z.object({
  firstName: z.string().min(2, 'First name must be at least 2 characters'),
  lastName: z.string().min(2, 'Last name must be at least 2 characters'),
  email: z.string().email('Please enter a valid email address'),
});

const addressSchema = z.object({
  address: z.string().min(5, 'Address must be at least 5 characters'),
  city: z.string().min(2, 'City must be at least 2 characters'),
  zipCode: z.string().min(5, 'Zip code must be at least 5 characters'),
});

const accountSchema = z
  .object({
    username: z.string().min(3, 'Username must be at least 3 characters'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
      .regex(/[0-9]/, 'Password must contain at least one number'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

// Combine all schemas for the final form data
const formSchema = z.object({
  ...personalInfoSchema.shape,
  ...addressSchema.shape,
  ...accountSchema.shape,
});

type FormData = z.infer<typeof formSchema>;

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
  const [step, setStep] = useState(0);
  const [formData, setFormData] = useState<Partial<FormData>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [error, setError] = useState<string>('');
  const [selectedRole, setSelectedRole] = useState<string>('user');

  const { signup, login, adminLogin, loginWithGoogle } = useAuth();

  // Define the steps for signup
  const signupSteps = [
    {
      id: 'personal',
      title: 'Personal Information',
      description: 'Tell us about yourself',
      schema: personalInfoSchema,
      icon: User,
      fields: [
        {
          name: 'firstName',
          label: 'First Name',
          type: 'text',
          placeholder: 'John',
          icon: User,
        },
        {
          name: 'lastName',
          label: 'Last Name',
          type: 'text',
          placeholder: 'Doe',
          icon: User,
        },
        {
          name: 'email',
          label: 'Email',
          type: 'email',
          placeholder: 'john.doe@example.com',
          icon: Mail,
        },
      ],
    },
    {
      id: 'address',
      title: 'Address Information',
      description: 'Where do you live?',
      schema: addressSchema,
      icon: MapPin,
      fields: [
        {
          name: 'address',
          label: 'Address',
          type: 'text',
          placeholder: '123 Main St',
          icon: MapPin,
        },
        { 
          name: 'city', 
          label: 'City', 
          type: 'text', 
          placeholder: 'New York',
          icon: MapPin,
        },
        {
          name: 'zipCode',
          label: 'Zip Code',
          type: 'text',
          placeholder: '10001',
          icon: MapPin,
        },
      ],
    },
    {
      id: 'account',
      title: 'Account Setup',
      description: 'Create your secure account',
      schema: accountSchema,
      icon: Lock,
      fields: [
        {
          name: 'username',
          label: 'Username',
          type: 'text',
          placeholder: 'johndoe',
          icon: User,
        },
        {
          name: 'password',
          label: 'Password',
          type: 'password',
          placeholder: '••••••••',
          icon: Lock,
        },
        {
          name: 'confirmPassword',
          label: 'Confirm Password',
          type: 'password',
          placeholder: '••••••••',
          icon: Lock,
        },
      ],
    },
  ];

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

  const steps = mode === 'signup' ? signupSteps : [loginStep];
  const currentStepSchema = steps[step].schema as z.ZodType<any, any, any>;

  // Setup form with the current step schema
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<any>({
    resolver: zodResolver(currentStepSchema),
    defaultValues: formData,
  });

  // Calculate progress percentage
  const progress = ((step + 1) / steps.length) * 100;

  // Handle Google Sign In
  const handleGoogleSignIn = async () => {
    try {
      setError('');
      setIsSubmitting(true);
      await loginWithGoogle();
      setIsComplete(true);
      if (onComplete) onComplete();
    } catch (error: any) {
      setError(error.message || 'Failed to sign in with Google');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle next step or final submission
const handleNextStep = async (data: any) => {
  try {
    setError('');
    const updatedData = { ...formData, ...data };
    setFormData(updatedData);

    if (mode === 'login') {
      setIsSubmitting(true);
      
      // Use adminLogin for admin and owner roles
      if (selectedRole === 'admin' || selectedRole === 'owner') {
        await adminLogin(data.email, data.password);
        setIsComplete(true);
        // Navigate to admin dashboard instead of calling onComplete
        window.location.href = '/admin';
        return;
      } else {
        await login(data.email, data.password);
      }
      
      setIsComplete(true);
      if (onComplete) onComplete();
    } else if (step < steps.length - 1) {
      setStep(step + 1);
      reset(updatedData);
    } else {
      setIsSubmitting(true);
      // The signup function will throw an error with a specific message
      await signup(
        updatedData.email, 
        updatedData.password, 
        {
          firstName: updatedData.firstName,
          lastName: updatedData.lastName,
          address: updatedData.address,
          city: updatedData.city,
          zipCode: updatedData.zipCode,
          username: updatedData.username,
        }
      );
      setIsComplete(true);
      if (onComplete) onComplete();
    }
  } catch (error: any) {
    // This will catch and display the specific error message from signup
    setError(error.message || 'Failed to create account. Please try again.');
    if (import.meta.env.DEV) {
      console.error('Authentication error:', error);
    }
  } finally {
    setIsSubmitting(false);
  }
};


  // Handle previous step
  const handlePrevStep = () => {
    if (step > 0) {
      setStep(step - 1);
    }
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
          {/* Progress bar for signup */}
          {mode === 'signup' && (
            <div className="mb-8">
              <div className="mb-2 flex justify-between">
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Step {step + 1} of {steps.length}
                </span>
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  {Math.round(progress)}%
                </span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}

          {/* Step indicators for signup */}
          {mode === 'signup' && (
            <div className="mb-8 flex justify-between">
              {steps.map((s, i) => {
                const IconComponent = s.icon;
                return (
                  <div key={s.id} className="flex flex-col items-center">
                    <div
                      className={cn(
                        'flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold transition-all',
                        i < step
                          ? 'bg-blue-500 text-white shadow-lg'
                          : i === step
                            ? 'bg-blue-500 text-white ring-blue-300 ring-4 shadow-lg'
                            : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400',
                      )}
                    >
                      {i < step ? <CheckCircle2 className="h-5 w-5" /> : <IconComponent className="h-5 w-5" />}
                    </div>
                    <span className="mt-2 hidden text-xs font-medium text-gray-600 dark:text-gray-400 sm:block">
                      {s.title}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Form */}
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial="hidden"
              animate="visible"
              exit="exit"
              variants={variants}
              transition={{ duration: 0.3 }}
            >
              <div className="mb-6 text-center">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                  {steps[step].title}
                </h2>
                <p className="text-gray-600 dark:text-gray-400">
                  {steps[step].description}
                </p>
              </div>

              {/* Google Sign In Button - Only show for regular users, not for admin/owner */}
              {!(mode === 'login' && (selectedRole === 'admin' || selectedRole === 'owner')) && (
                <>
                  <div className="mb-6">
                    <GoogleSignInButton 
                      onClick={handleGoogleSignIn}
                      disabled={isSubmitting}
                      text={mode === 'signup' ? 'Sign up with Google' : 'Sign in with Google'}
                    />
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

              {/* Info message for admin/owner login */}
              {mode === 'login' && (selectedRole === 'admin' || selectedRole === 'owner') && (
                <div className="mb-6 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <p className="text-sm text-blue-700 dark:text-blue-400 flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    {selectedRole === 'admin' ? 'Admin' : 'Owner'} login requires email and password authentication only.
                  </p>
                </div>
              )}

              {error && (
                <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                </div>
              )}

              <form
                onSubmit={handleSubmit(handleNextStep)}
                className="space-y-4"
              >
                {steps[step].fields.map((field) => {
                  const IconComponent = field.icon;
                  
                  // Handle select field for role
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
                  
                  // Handle regular input fields
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
                          type={field.type}
                          placeholder={field.placeholder}
                          {...register(field.name as any)}
                          className={cn(
                            'pl-10 h-12 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-transparent',
                            errors[field.name as string] && 'border-red-500 focus:ring-red-500',
                          )}
                        />
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

                <div className="flex justify-between pt-6">
                  {mode === 'signup' && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handlePrevStep}
                      disabled={step === 0 || isSubmitting}
                      className={cn(step === 0 && 'invisible')}
                    >
                      <ArrowLeft className="mr-2 h-4 w-4" /> Back
                    </Button>
                  )}
                  <Button 
                    type="submit" 
                    disabled={isSubmitting}
                    className={cn(
                      'bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg font-medium transition-all',
                      mode === 'login' && 'w-full'
                    )}
                  >
                    {isSubmitting ? (
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        {mode === 'signup' 
                          ? (step === steps.length - 1 ? 'Creating Account...' : 'Processing...')
                          : 'Signing In...'
                        }
                      </div>
                    ) : (
                      <>
                        {mode === 'signup' 
                          ? (step === steps.length - 1 ? 'Create Account' : 'Next')
                          : 'Sign In'
                        }
                        {mode === 'signup' && step < steps.length - 1 && (
                          <ArrowRight className="ml-2 h-4 w-4" />
                        )}
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </motion.div>
          </AnimatePresence>
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
