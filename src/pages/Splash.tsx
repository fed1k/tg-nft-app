import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useTelegram } from '../contexts/TelegramContext'
import AccountBlocked from './AccountBlocked'

const Splash = () => {
    const navigate = useNavigate()
    const { isInTelegram, accessState, verifyAccountAccess, webApp } = useTelegram()
    const [checking, setChecking] = useState(false)

    const enterApp = async (path: string) => {
        if (accessState === 'blocked') return
        setChecking(true)
        try {
            const ok = await verifyAccountAccess()
            if (!ok) {
                webApp?.showAlert?.('Your account cannot access GiftedForge.')
                return
            }
            navigate(path)
        } finally {
            setChecking(false)
        }
    }

    const handleContinueWithTelegram = () => {
        const startParam = webApp?.initDataUnsafe?.start_param
        if (startParam?.startsWith('col_')) {
            const id = startParam.substring(4)
            return void enterApp(`/app/collection/${id}`)
        }
        if (startParam?.startsWith('collectible_')) {
            const id = startParam.substring(12)
            return void enterApp(`/asset/${id}`)
        }
        void enterApp('/app/home')
    }

    const handleCreateWallet = () => void enterApp('/app/wallet')

    const handleImportWallet = () => void enterApp('/app/wallet')

    const handleAdminAccess = () => {
        navigate('/admin-access')
    }

    if (accessState === 'blocked') {
        return <AccountBlocked />
    }

    const galleryImages = [
        "/bear.jpg",
        "/heart-splash.jpg",
        "/headphone-skull.png",
        "/weard-head.png",
        "/coin.jpg"
    ];

    return (
        <div className='bg-[#0E0636] min-h-screen relative overflow-hidden'>
            {/* Background Glows */}
            <div className='absolute top-[-10%] left-[-10%] w-[40%] h-[40%] spotlight-glow rounded-full opacity-50 pointer-events-none'></div>
            <div className='absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] spotlight-glow rounded-full opacity-30 pointer-events-none'></div>

            <div className='max-w-[393px] mx-auto overflow-hidden flex flex-col min-h-screen relative z-10'>
                {/* Infinite Right-to-Left Marquee */}
                <div className='relative pt-12 mask-fade-edges flex-shrink-0'>
                    <div className='flex gap-4 animate-marquee py-4'>
                        {/* First set of images */}
                        {galleryImages.map((src, i) => (
                            <div key={`img1-${i}`} className='relative flex-shrink-0'>
                                <img 
                                    src={src} 
                                    className='w-[140px] h-[190px] object-cover border-[1.5px] border-white/20 rounded-[32px] shadow-2xl' 
                                    alt="" 
                                />
                                <div className="absolute inset-0 rounded-[32px] reflection-overlay"></div>
                            </div>
                        ))}
                        {/* Duplicate set for seamless loop */}
                        {galleryImages.map((src, i) => (
                            <div key={`img2-${i}`} className='relative flex-shrink-0'>
                                <img 
                                    src={src} 
                                    className='w-[140px] h-[190px] object-cover border-[1.5px] border-white/20 rounded-[32px] shadow-2xl' 
                                    alt="" 
                                />
                                <div className="absolute inset-0 rounded-[32px] reflection-overlay"></div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className='justify-center pt-[19px] flex gap-2 items-center'>
                    <div className='w-[13px] h-[13px] border border-white rounded-full'></div>
                    <div className='w-[9px] h-[9px] bg-white rounded-full'></div>
                    <div className='w-[9px] h-[9px] bg-white rounded-full'></div>
                    <div className='w-[9px] h-[9px] bg-white rounded-full'></div>
                    <div className='w-[9px] h-[9px] bg-white rounded-full'></div>
                </div>

                <div className='text-white pt-12 px-6'>
                    <h2 className='text-center text-2xl font-semibold'>Own. Mint. Trade NFTs.</h2>
                    <p className='text-center pt-4'>
                        Take control of your digital assets and <br /> StarGifts with GiftedForge—all in one <br /> seamless experience.
                        </p>

                        <button
                            onClick={handleContinueWithTelegram}
                            disabled={checking || accessState === 'blocked'}
                        className='border border-white mt-12 rounded-lg w-full h-11 text-sm font-semibold flex items-center justify-center gap-2 hover:bg-white/10 transition-colors disabled:opacity-50'
                        >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L7.17 13.63l-2.965-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.983.929z" />
                            </svg>
                            {checking ? 'Checking…' : isInTelegram ? 'Continue with Telegram' : 'Open App'}
                        </button>

                        <div className='flex gap-4 pt-4'>
                            <button
                                onClick={handleCreateWallet}
                            className='border border-white flex-1 rounded-lg h-11 text-sm font-medium hover:bg-white/10 transition-colors'
                            >
                                Create Wallet
                            </button>
                            <button
                                onClick={handleImportWallet}
                            className='border border-white flex-1 rounded-lg h-11 text-sm font-medium hover:bg-white/10 transition-colors'
                            >
                                Import Wallet
                            </button>
                    </div>
                </div>

                    <button
                        type='button'
                        onClick={handleAdminAccess}
                    className='w-full flex justify-center pt-12 items-center gap-1 text-white/90 hover:text-white transition-colors'
                    >
                    <img src="/security-safe.svg" className='w-3.5 h-3.5' alt="" />
                    <p className='text-xs'>Admin Access</p>
                    </button>
            </div>
        </div>
    )
}

export default Splash
