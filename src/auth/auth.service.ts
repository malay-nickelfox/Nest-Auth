import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { User } from '../models/user.model';
import { SignupDto } from './dtos/signup.dto';
import { LoginDto } from './dtos/login.dto';
import { OtpLoginDto } from './dtos/otp-login.dto';
import { Op } from 'sequelize';
import { AuthMessages } from './auth.constants';
import { MailerService } from '../common/mailer.service';
import { TokenService } from '../common/token.service';

@Injectable()
export class AuthService {
  tokenService: TokenService;
  constructor(
    @InjectModel(User) private userModel: typeof User,
    jwtService: JwtService,
  ) {
    this.tokenService = new TokenService(jwtService);
  }

  async signup(signupDto: SignupDto) {
    const { username, email, password } = signupDto;
    const existingUser = await this.userModel.findOne({
      where: {
        [Op.or]: [{ username: username }, { email: email }],
      },
    });

    if (existingUser) {
      if (existingUser.username === username) {
        throw new ConflictException(AuthMessages.usernameExists);
      }
      if (existingUser.email === email) {
        throw new ConflictException(AuthMessages.emailExists);
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    return this.userModel.create({
      username,
      email,
      password: hashedPassword,
    });
  }

  async login(loginDto: LoginDto) {
    const { username, password } = loginDto;
    const user = await this.userModel.findOne({
      where: { username: username || null },
    });

    if (!user) {
      throw new UnauthorizedException(AuthMessages.invalidCredentials);
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException(AuthMessages.invalidPassword);
    }

    const token = this.tokenService.createToken(user);
    return {
      message: AuthMessages.loginSuccessful,
      token: token,
    };
  }

  async requestOtp(email: string) {
    const user = await this.userModel.findOne({ where: { email } });
    if (!user) throw new UnauthorizedException(AuthMessages.invalidEmail);

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date();
    otpExpiry.setMinutes(otpExpiry.getMinutes() + 10);

    user.otp = otp;
    user.otpExpiry = otpExpiry;
    await user.save();
    await MailerService.sendOtpEmail(email, otp);
    
    return { message: AuthMessages.otpSent };
  }

  async otpLogin(otpLoginDto: OtpLoginDto) {
    const { email, otp } = otpLoginDto;
    const user = await this.userModel.findOne({ where: { email } });

    if (!user) {
      throw new UnauthorizedException(AuthMessages.invalidEmail);
    }

    const currentTime = new Date();
    const otpExpiryTime = new Date(user.otpExpiry);

    if (user.otp !== otp) {
      throw new UnauthorizedException(AuthMessages.invalidOtp);
    }

    if (currentTime > otpExpiryTime) {
      throw new UnauthorizedException(AuthMessages.otpExpired);
    }

    const token = this.tokenService.createToken(user);
    return {
      message: AuthMessages.loginSuccessful,
      token: token,
    };
  }
}
